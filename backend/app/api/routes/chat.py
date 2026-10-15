"""Analyst Q&A over a single case file."""

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.deps import DbSession, OwnedCase
from app.api.routes.cam import _memo_payload
from app.config import settings
from app.core.rate_limit import limiter
from app.llm.chat import answer_case_question
from app.llm.client import is_enabled as llm_enabled
from app.schemas.application import ChatRequest

router = APIRouter(prefix="/applications/{app_id}", tags=["chat"])


@router.post("/chat")
@limiter.limit(settings.RATE_LIMIT_LLM)
def ask_about_case(
    request: Request,
    response: Response,
    payload: ChatRequest,
    case: OwnedCase,
    db: DbSession,
) -> dict:
    """
    Answer a question about this case from its own structured data.

    Deliberately stateless - each question is answered from the case record
    rather than a running conversation. The audit trail is the case's history;
    a chat transcript would be a second, unreconciled one.

    Rate limited per user, not per address: every call spends model
    tokens, and the caller is authenticated here, so the budget belongs
    to the account rather than to whatever network it dialled in from.
    """
    if not llm_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The case assistant is not configured on this deployment.",
        )
    if case.total_score is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analyse the case before asking questions about it.",
        )

    answer = answer_case_question(_memo_payload(case, db), payload.question)
    if answer is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The case assistant did not return an answer. Try again.",
        )

    return {"question": payload.question, "answer": answer}
