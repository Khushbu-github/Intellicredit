"""
Request rate limiting.

The deployed app has open registration and two endpoints that spend money on
every call (the memo narrative and the analyst chat both invoke a model), so
an unthrottled public URL is a standing invitation to run up the bill. Three
distinct abuses are worth stopping, and they want different keys:

  * account farming   - many registrations from one source     -> key on IP
  * password guessing - many logins against one account        -> key on IP
  * model-spend abuse - one logged-in account calling the LLM  -> key on user

Authenticated traffic is therefore keyed on the user id rather than the
address. Keying model spend on IP would be wrong in both directions: a whole
office behind one NAT would share a single budget, while one attacker with a
handful of addresses would get several.

slowapi is used rather than a hand-rolled counter because it already
implements the window accounting and the Retry-After accounting, and because
its storage is a URI swap - moving to Redis when this runs on more than one
instance is a configuration change, not a rewrite. That single-instance
caveat is real and deliberate: on the current deployment the counters live in
process memory and reset on restart.
"""

from __future__ import annotations

from fastapi import Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter

from app.config import settings
from app.core.security import decode_access_token


def client_address(request: Request) -> str:
    """
    The caller's address, accounting for the reverse proxies in front of us.

    X-Forwarded-For cannot be trusted blindly: a client may send the header
    itself, and each proxy *appends* to it, so the leftmost entry is whatever
    the client claimed. Only the entries our own proxies appended are
    trustworthy, and there are exactly TRUSTED_PROXY_HOPS of those, at the
    right-hand end. With one proxy in front (Render's edge) the real address
    is the last entry; with none we ignore the header entirely.
    """
    hops = settings.TRUSTED_PROXY_HOPS
    if hops > 0:
        forwarded = request.headers.get("x-forwarded-for", "")
        parts = [part.strip() for part in forwarded.split(",") if part.strip()]
        if len(parts) >= hops:
            return parts[-hops]

    return request.client.host if request.client else "unknown"


def client_key(request: Request) -> str:
    """
    Identify the caller: the authenticated user when there is one, else the
    address. The token is only decoded, never looked up - this runs before the
    route's dependencies and must not touch the database on every request. A
    forged token fails signature verification and falls through to the
    address, so the fallback is never weaker than the anonymous case.
    """
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token:
        subject = decode_access_token(token.strip())
        if subject is not None:
            return f"user:{subject}"

    return f"ip:{client_address(request)}"


limiter = Limiter(
    key_func=client_key,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    # Emits X-RateLimit-* and Retry-After so a client can back off deliberately
    # rather than by guesswork.
    headers_enabled=True,
    # Fixed window over sliding: it costs one counter per key instead of a
    # timestamp log, and the boundary burst it allows is not a concern at
    # limits this generous.
    strategy="fixed-window",
    enabled=settings.RATE_LIMIT_ENABLED,
)


def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Return a throttling refusal in the same shape as every other error the API
    produces, so the frontend's existing error handling renders it without a
    special case. slowapi ships a handler of its own, but it emits a bare
    string body that would surface in the UI as an empty message.
    """
    limit = getattr(exc, "detail", "")
    response = JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "detail": (
                "Too many requests. This is a public demo deployment with "
                f"limits in place ({limit}). Please wait and try again."
            )
        },
    )
    # request.state.view_rate_limit is set by slowapi before it raises; it is
    # what injects the X-RateLimit-* and Retry-After headers.
    return request.app.state.limiter._inject_headers(
        response, request.state.view_rate_limit
    )
