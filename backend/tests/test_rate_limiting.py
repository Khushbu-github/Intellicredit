"""
Rate limiting.

Two things are worth proving here. The first is that the limits actually fire,
because a limiter that is silently disabled looks exactly like one that works
until the bill arrives. The second is that the key is derived correctly: the
whole design rests on anonymous traffic being keyed on address and
authenticated traffic on the account, and on X-Forwarded-For being trusted
only as far as the configured number of proxies.
"""

from fastapi import Request

from app.config import settings
from app.core.rate_limit import client_address, client_key
from app.core.security import create_access_token


def _request(headers: dict[str, str] | None = None, client_host: str = "10.0.0.1"):
    """A bare Starlette request; the key functions only read headers and peer."""
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": raw,
            "client": (client_host, 12345),
        }
    )


# --- key derivation ---------------------------------------------------------


def test_anonymous_caller_is_keyed_on_address():
    assert client_key(_request()) == "ip:10.0.0.1"


def test_authenticated_caller_is_keyed_on_user():
    """
    Two analysts sharing an office NAT must not share a model budget, so a
    valid token has to win over the address.
    """
    token = create_access_token(42)
    key = client_key(_request({"Authorization": f"Bearer {token}"}))
    assert key == "user:42"


def test_forged_token_falls_back_to_address():
    """A bad signature must not become an unlimited free key."""
    key = client_key(_request({"Authorization": "Bearer not.a.real.token"}))
    assert key == "ip:10.0.0.1"


def test_forwarded_for_is_ignored_when_no_proxy_is_trusted(monkeypatch):
    """
    With TRUSTED_PROXY_HOPS=0 the header is attacker-controlled noise: honouring
    it would let anyone mint a fresh bucket per request.
    """
    monkeypatch.setattr(settings, "TRUSTED_PROXY_HOPS", 0)
    request = _request({"X-Forwarded-For": "1.2.3.4"})
    assert client_address(request) == "10.0.0.1"


def test_forwarded_for_uses_the_hop_our_proxy_appended(monkeypatch):
    """
    Behind one proxy the trustworthy entry is the last one, because the client
    may have sent the earlier entries itself. Taking the leftmost - the naive
    reading of the header - would take the spoofed value.
    """
    monkeypatch.setattr(settings, "TRUSTED_PROXY_HOPS", 1)
    request = _request({"X-Forwarded-For": "9.9.9.9, 203.0.113.7"})
    assert client_address(request) == "203.0.113.7"


def test_forwarded_for_falls_back_when_shorter_than_configured(monkeypatch):
    """A header with fewer hops than configured is malformed - do not index it."""
    monkeypatch.setattr(settings, "TRUSTED_PROXY_HOPS", 2)
    request = _request({"X-Forwarded-For": "203.0.113.7"})
    assert client_address(request) == "10.0.0.1"


# --- enforcement ------------------------------------------------------------


def test_registration_is_throttled(client, rate_limited):
    """Open registration is the cheapest route to the model-backed endpoints."""
    allowed = int(settings.RATE_LIMIT_REGISTER.split("/")[0])

    for index in range(allowed):
        response = client.post(
            "/api/auth/register",
            json={
                "email": f"analyst{index}@bank.example",
                "password": "correct-horse-battery",
                "full_name": "Test Analyst",
            },
        )
        assert response.status_code == 201, response.text

    blocked = client.post(
        "/api/auth/register",
        json={
            "email": "one-too-many@bank.example",
            "password": "correct-horse-battery",
            "full_name": "Test Analyst",
        },
    )
    assert blocked.status_code == 429
    assert "Too many requests" in blocked.json()["detail"]
    assert "Retry-After" in blocked.headers


def test_login_is_throttled(client, rate_limited):
    """Password guessing must not be free."""
    allowed = int(settings.RATE_LIMIT_LOGIN.split("/")[0])

    for _ in range(allowed):
        response = client.post(
            "/api/auth/login",
            data={"username": "nobody@bank.example", "password": "wrong"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/auth/login",
        data={"username": "nobody@bank.example", "password": "wrong"},
    )
    assert blocked.status_code == 429


def test_throttled_response_is_json_with_a_detail_key(client, rate_limited):
    """
    The frontend renders `detail` for every other error; slowapi's stock
    handler returns a bare string, which would surface as an empty message.
    """
    for _ in range(int(settings.RATE_LIMIT_LOGIN.split("/")[0]) + 1):
        response = client.post(
            "/api/auth/login",
            data={"username": "nobody@bank.example", "password": "wrong"},
        )

    assert response.status_code == 429
    assert response.headers["content-type"].startswith("application/json")
    assert isinstance(response.json()["detail"], str)


def test_limiter_is_disabled_for_the_rest_of_the_suite():
    """
    Guards the fixture's cleanup: if this ever fails, an earlier test leaked an
    enabled limiter and the other 160-odd tests are one shared bucket away
    from flaking.
    """
    from app.core.rate_limit import limiter

    assert limiter.enabled is False
