"""
Credit Appraisal Memo generation, and the optional LLM narrative behind it.

The narrative is generated and persisted as a separate step, so the memo can
always be produced - with template prose - whether or not a model is
configured or reachable.
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, OwnedCase
from app.cam.generator import generate_cam_docx
from app.db.models import Document, ScoreEvent
from app.llm.client import is_enabled as llm_enabled
from app.llm.narrative import draft_narrative
from app.services.case_service import case_as_dict
from app.services.pipeline import DOC_LABELS

router = APIRouter(prefix="/applications/{app_id}", tags=["cam"])

DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


def _memo_payload(case, db: DbSession) -> dict:
    documents = db.query(Document).filter(Document.application_id == case.id).all()
    events = (
        db.query(ScoreEvent)
        .filter(ScoreEvent.application_id == case.id)
        .order_by(ScoreEvent.at.asc())
        .all()
    )

    payload = case_as_dict(case)
    payload["documents"] = [
        {
            "filename": d.filename,
            "doc_label": DOC_LABELS.get(d.doc_type, d.doc_type),
            "parse_status": d.parse_status,
            "parse_message": d.parse_message,
        }
        for d in documents
    ]
    payload["events"] = [
        {"at": e.at, "trigger": e.trigger, "summary": e.summary} for e in events
    ]
    return payload


@router.post("/narrative")
def generate_narrative(case: OwnedCase, db: DbSession) -> dict:
    """
    Draft the memo's prose sections with the model and store them on the case.

    The decision, score, limit and covenants are already fixed by the policy
    engine before this runs - the model writes the commentary around them and
    is instructed never to restate or contradict a figure.
    """
    if not llm_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model-assisted drafting is not configured on this deployment.",
        )
    if case.total_score is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analyse the case before drafting its memo narrative.",
        )

    drafted = draft_narrative(_memo_payload(case, db))
    if drafted is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The drafting service did not return a usable narrative. Try again.",
        )

    case.narrative = drafted
    db.commit()
    return {"status": "success", "narrative": drafted}


@router.get("/cam")
def get_cam(case: OwnedCase, db: DbSession) -> StreamingResponse:
    payload = _memo_payload(case, db)
    stream = generate_cam_docx(payload)

    safe = "".join(
        c for c in (case.company_name or "Borrower") if c.isalnum() or c in " -_"
    ).strip().replace(" ", "_")[:48] or "Borrower"

    return StreamingResponse(
        stream,
        media_type=DOCX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="CAM_{safe}_{case.id:04d}.docx"'
        },
    )
