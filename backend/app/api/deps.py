"""
Shared FastAPI dependencies: the database session, the authenticated user,
and ownership-checked case lookup.

get_case() is the single chokepoint through which every case is read. Because
it filters on owner_id rather than fetching by primary key and checking
afterwards, an unauthorised case is indistinguishable from a missing one -
the API never confirms that someone else's case id exists.
"""

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import decode_access_token
from app.db.base import SessionLocal
from app.db.models import Application, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    subject = decode_access_token(token)
    if subject is None:
        raise CREDENTIALS_ERROR

    try:
        user_id = int(subject)
    except (TypeError, ValueError) as exc:
        raise CREDENTIALS_ERROR from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise CREDENTIALS_ERROR
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_case(app_id: int, db: DbSession, user: CurrentUser) -> Application:
    """Fetch a case the caller owns, or 404."""
    case = (
        db.query(Application)
        .filter(Application.id == app_id, Application.owner_id == user.id)
        .first()
    )
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application {app_id} not found.",
        )
    return case


OwnedCase = Annotated[Application, Depends(get_case)]
