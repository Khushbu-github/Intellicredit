"""Registration, login and the current-user endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.config import settings
from app.core.rate_limit import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User
from app.schemas.auth import Token, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(user: User) -> Token:
    return Token(
        access_token=create_access_token(user.id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserRead.model_validate(user),
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_REGISTER)
def register(
    request: Request, response: Response, payload: UserCreate, db: DbSession
) -> Token:
    """
    Create an analyst account.

    Rate limited per address: registration is open so that the deployed
    demo can be tried without an invite, which also means it is the
    cheapest way to farm accounts and reach the model-backed endpoints.
    """
    email = payload.email.lower().strip()

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email address already exists.",
        )

    user = User(
        email=email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue(user)


@router.post("/login", response_model=Token)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(
    request: Request,
    response: Response,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
) -> Token:
    """
    OAuth2 password flow: the client posts `username` (the email) and
    `password` as form fields, which is what FastAPI's own docs page and the
    standard bearer-token clients expect.

    Rate limited per address so the endpoint cannot be used to guess
    passwords; the limit is deliberately on the caller rather than the
    account, so an attacker cannot lock a real user out by failing logins
    against their address on purpose.
    """
    user = db.query(User).filter(User.email == form.username.lower().strip()).first()

    # One message for both "no such user" and "wrong password", so the endpoint
    # cannot be used to enumerate which email addresses have accounts.
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled."
        )

    return _issue(user)


@router.get("/me", response_model=UserRead)
def read_me(user: CurrentUser) -> User:
    return user
