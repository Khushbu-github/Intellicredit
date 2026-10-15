"""
Configuration boot guards.

The app is deployed from the same image it runs locally, so the only thing
standing between a misconfigured environment and a live service is these
checks. They are asserted here because a weak signing key does not fail
visibly at runtime - it just quietly makes every token easier to forge.
"""

import pytest


def test_production_rejects_a_short_secret_key(monkeypatch):
    """
    A short key is the quiet failure: it is not a placeholder, so a
    prefix check waves it through, but it weakens every token the app issues.
    """
    from app.config import Settings, get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "too-short")
    get_settings.cache_clear()
    monkeypatch.setattr("app.config.Settings", Settings)

    with pytest.raises(RuntimeError, match="at least 32 bytes"):
        get_settings()

    get_settings.cache_clear()


def test_production_rejects_the_development_placeholder(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SECRET_KEY", "dev-only-insecure-key-change-me")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="strong random value"):
        get_settings()

    get_settings.cache_clear()
