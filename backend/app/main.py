"""
Application factory and router registration.

Notice what is NOT here: no StaticFiles mount over the upload directory, and
no create_all() at import time. Uploaded borrower documents are served only
through an authenticated, ownership-checked route, and the schema is owned by
Alembic.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes import applications, auth, cam, chat, documents, meta
from app.config import settings
from app.core.rate_limit import limiter, rate_limit_exceeded_handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.PROJECT_NAME} Engine",
        description=(
            "Corporate credit appraisal: ingestion, 5Cs scoring, decisioning "
            "and CAM generation."
        ),
        version="3.0.0",
    )

    # The limiter is attached to app.state because slowapi's decorator looks
    # it up there at request time. The middleware applies the default limit to
    # every route; the per-route decorators tighten it where abuse is costly.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # Origins come from the environment, and preview deployments are matched by
    # regex, so a new Vercel preview URL does not require a backend redeploy.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_origin_regex=settings.ALLOWED_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    prefix = settings.API_V1_PREFIX
    app.include_router(meta.router, prefix=prefix)
    app.include_router(auth.router, prefix=prefix)
    app.include_router(applications.router, prefix=prefix)
    app.include_router(documents.router, prefix=prefix)
    app.include_router(cam.router, prefix=prefix)
    app.include_router(chat.router, prefix=prefix)

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        """Liveness probe. Render pings this to keep the service warm."""
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    return app


app = create_app()
