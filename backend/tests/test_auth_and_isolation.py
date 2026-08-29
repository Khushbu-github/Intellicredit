"""
Authentication, and the tenant isolation that depends on it.

The isolation tests are the ones that matter most: before this work every
endpoint was public, so any caller could list, read or delete any borrower's
case. These assert that a second analyst gets a 404 - not a 403 - because a
403 would confirm that the case id exists.
"""


def test_register_returns_a_usable_token(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "new@bank.example", "password": "correct-horse-battery"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "new@bank.example"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200


def test_password_is_never_returned_or_stored_in_clear(client, db_session):
    from app.db.models import User

    client.post(
        "/api/auth/register",
        json={"email": "hash@bank.example", "password": "correct-horse-battery"},
    )
    user = db_session.query(User).filter(User.email == "hash@bank.example").first()
    assert user.hashed_password != "correct-horse-battery"
    assert user.hashed_password.startswith("$2b$")


def test_duplicate_email_is_rejected(client):
    payload = {"email": "dupe@bank.example", "password": "correct-horse-battery"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409


def test_short_password_is_rejected(client):
    response = client.post(
        "/api/auth/register", json={"email": "weak@bank.example", "password": "short"}
    )
    assert response.status_code == 422


def test_login_succeeds_with_correct_credentials(client):
    client.post(
        "/api/auth/register",
        json={"email": "login@bank.example", "password": "correct-horse-battery"},
    )
    response = client.post(
        "/api/auth/login",
        data={"username": "login@bank.example", "password": "correct-horse-battery"},
    )
    assert response.status_code == 200 and response.json()["access_token"]


def test_wrong_password_and_unknown_user_are_indistinguishable(client):
    """The login error must not reveal which email addresses have accounts."""
    client.post(
        "/api/auth/register",
        json={"email": "known@bank.example", "password": "correct-horse-battery"},
    )
    wrong = client.post(
        "/api/auth/login", data={"username": "known@bank.example", "password": "nope"}
    )
    unknown = client.post(
        "/api/auth/login", data={"username": "ghost@bank.example", "password": "nope"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"]


def test_protected_routes_reject_anonymous_callers(client, case_id):
    for method, path in [
        ("get", "/api/applications"),
        ("get", f"/api/applications/{case_id}/analysis"),
        ("get", f"/api/applications/{case_id}/documents"),
        ("get", f"/api/applications/{case_id}/cam"),
        ("delete", f"/api/applications/{case_id}"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 401, f"{method.upper()} {path} was not protected"


def test_meta_stays_public(client):
    """Reference data carries no borrower information and feeds the login page."""
    assert client.get("/api/meta").status_code == 200


def test_garbage_and_expired_tokens_are_refused(client):
    from datetime import timedelta

    from app.core.security import create_access_token

    assert client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
    ).status_code == 401

    expired = create_access_token(1, expires_delta=timedelta(seconds=-10))
    assert client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {expired}"}
    ).status_code == 401


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------

def test_another_analyst_cannot_read_a_case(client, case_id, other_headers):
    response = client.get(f"/api/applications/{case_id}/analysis", headers=other_headers)
    assert response.status_code == 404


def test_another_analyst_cannot_delete_a_case(client, case_id, other_headers, auth_headers):
    assert client.delete(
        f"/api/applications/{case_id}", headers=other_headers
    ).status_code == 404
    # And the owner still has it.
    assert client.get(
        f"/api/applications/{case_id}/analysis", headers=auth_headers
    ).status_code == 200


def test_another_analyst_cannot_upload_to_a_case(client, case_id, other_headers):
    response = client.post(
        f"/api/applications/{case_id}/documents",
        files={"files": ("gst_returns.csv", b"Type,GSTIN,Amount\n", "text/csv")},
        headers=other_headers,
    )
    assert response.status_code == 404


def test_the_portfolio_lists_only_the_callers_own_cases(client, case_id, other_headers, auth_headers):
    client.post(
        "/api/applications",
        json={"company_name": "Someone Else Ltd", "sector": "Trading"},
        headers=other_headers,
    )

    mine = client.get("/api/applications", headers=auth_headers).json()
    theirs = client.get("/api/applications", headers=other_headers).json()

    assert [c["id"] for c in mine["applications"]] == [case_id]
    assert case_id not in [c["id"] for c in theirs["applications"]]
    assert theirs["count"] == 1
