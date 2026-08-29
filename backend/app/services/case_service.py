"""
Case-level orchestration shared by the routes.

Recomputation and its audit event are always written together, in one
transaction. Splitting them - as the previous code did, by committing the
scores from one place and the event from another - allows a case whose score
changed with no trail explaining why, which defeats the point of an audit log.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Application, Document, ScoreEvent
from app.services.pipeline import recompute


def load_documents(db: Session, app_id: int) -> list[Document]:
    return db.query(Document).filter(Document.application_id == app_id).all()


def run_recompute(
    db: Session,
    case: Application,
    trigger: str,
    documents: list[Document] | None = None,
) -> Application:
    """Re-score a case from its stored documents and record the event."""
    documents = load_documents(db, case.id) if documents is None else documents
    fields, event = recompute(case, documents, trigger=trigger)

    for key, value in fields.items():
        setattr(case, key, value)

    db.add(
        ScoreEvent(
            application_id=case.id,
            trigger=event["trigger"],
            summary=event["summary"],
            total_score=event["total_score"],
            decision=event["decision"],
            delta=event["delta"],
            detail=event["detail"],
        )
    )
    db.commit()
    db.refresh(case)
    return case


def case_as_dict(case: Application) -> dict:
    return {c.name: getattr(case, c.name) for c in case.__table__.columns}
