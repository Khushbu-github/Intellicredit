"""
Case portfolio, scoring, what-if analysis and the audit trail.

Every route here resolves its case through the ownership-checked `get_case`
dependency, so a case belonging to another analyst returns 404 rather than
leaking its existence.
"""


from fastapi import APIRouter, HTTPException, Query, status

from app.analysis.decision_engine import breakeven_analysis, sensitivity
from app.api.deps import CurrentUser, DbSession, OwnedCase
from app.db.models import Application, ScoreEvent
from app.schemas.application import (
    ApplicationCreate,
    ApplicationSummary,
    PrimaryNotesUpdate,
    ScoreEventRead,
    SimulationRequest,
)
from app.services import storage
from app.services.case_service import case_as_dict, run_recompute

router = APIRouter(prefix="/applications", tags=["applications"])


def _summary(case: Application) -> ApplicationSummary:
    summary = ApplicationSummary.model_validate(case)
    summary.document_count = len(case.documents)
    return summary


@router.get("", response_model=dict)
def list_applications(
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
) -> dict:
    """The caller's own case portfolio, newest first."""
    query = db.query(Application).filter(Application.owner_id == user.id)
    if status_filter:
        query = query.filter(Application.status == status_filter)

    cases = query.order_by(Application.id.desc()).limit(limit).all()
    return {"count": len(cases), "applications": [_summary(c) for c in cases]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_application(payload: ApplicationCreate, db: DbSession, user: CurrentUser) -> dict:
    case = Application(
        owner_id=user.id,
        company_name=payload.company_name.strip(),
        sector=payload.sector,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return {"app_id": case.id, "company_name": case.company_name, "sector": case.sector}


@router.delete("/{app_id}")
def delete_application(case: OwnedCase, db: DbSession) -> dict:
    """Remove a case, its documents, its audit trail and its stored files."""
    app_id = case.id
    db.delete(case)
    db.commit()
    storage.delete_case_files(app_id)
    return {"status": "deleted", "app_id": app_id}


@router.get("/{app_id}/analysis")
def get_analysis(case: OwnedCase) -> dict:
    return case_as_dict(case)


@router.post("/{app_id}/reanalyze")
def reanalyze(case: OwnedCase, db: DbSession) -> dict:
    """Re-run scoring against the documents already on file."""
    if not case.documents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No documents on file to analyse.",
        )
    run_recompute(db, case, trigger="reanalysis")
    return {"status": "success", "total_score": case.total_score, "decision": case.decision}


@router.get("/{app_id}/events", response_model=dict)
def get_events(case: OwnedCase, db: DbSession) -> dict:
    """The append-only scoring history behind the audit trail."""
    events = (
        db.query(ScoreEvent)
        .filter(ScoreEvent.application_id == case.id)
        .order_by(ScoreEvent.at.desc())
        .all()
    )
    return {"count": len(events), "events": [ScoreEventRead.model_validate(e) for e in events]}


@router.get("/{app_id}/breakeven")
def get_breakeven(case: OwnedCase) -> dict:
    """How far the case sits from each policy gate."""
    return breakeven_analysis(
        {"total": case.total_score or 0},
        {"dscr": case.dscr, "litigation_count": case.litigation_count or 0},
    )


@router.post("/{app_id}/primary-notes")
def update_primary_notes(
    payload: PrimaryNotesUpdate, case: OwnedCase, db: DbSession
) -> dict:
    """
    Record the relationship manager's field observations and re-score.

    The observations are stored on the case and fed back through the same
    scoring pipeline, so the utilisation figure appears in the Capacity pillar
    breakdown and the keyword overrides are re-applied on every subsequent run
    rather than being baked into a one-off score.
    """
    case.factory_capacity = payload.factory_capacity
    case.qualitative_notes = payload.qualitative_notes
    if payload.mgmt_quality is not None:
        case.mgmt_quality = payload.mgmt_quality
    db.commit()

    run_recompute(db, case, trigger="primary_notes")

    latest = (
        db.query(ScoreEvent)
        .filter(ScoreEvent.application_id == case.id)
        .order_by(ScoreEvent.id.desc())
        .first()
    )
    return {
        "status": "success",
        "new_total": case.total_score,
        "risk_grade": case.risk_grade,
        "decision": case.decision,
        "overrides": ((latest.detail or {}).get("overrides", []) if latest else []),
    }


@router.post("/{app_id}/simulate")
def simulate(payload: SimulationRequest, case: OwnedCase) -> dict:
    """
    What-if analysis: re-run the decision against overridden inputs.

    Nothing is persisted. This answers the question a credit committee always
    asks - what would have to change for this to be bankable - using the same
    engine that produced the live recommendation.
    """
    if case.total_score is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analyse the case before simulating against it.",
        )

    research = case.research or {}
    mca = research.get("mca", {})

    baseline = {
        "revenue": case.revenue,
        "ebitda": case.ebitda,
        "dscr": case.dscr,
        "interest_coverage": case.interest_coverage,
        "debt_equity": case.debt_equity,
        "promoter_stake": case.promoter_stake,
        "promoter_pledge": case.promoter_pledge,
        "collateral_value": case.collateral_value,
        "security_cover": case.security_cover,
        "existing_limits": case.existing_limits,
        "cibil_score": case.cibil_score,
        "cibil_dpd_30": case.cibil_dpd_30,
        "external_rating": case.external_rating,
        "rating_outlook": case.rating_outlook,
        "litigation_count": case.litigation_count or 0,
        "bounce_count": case.bounce_count or 0,
        "circular_trading_pct": case.gst_circular_trading_pct or 0,
        "related_party_flag": case.related_party_flag,
        "factory_capacity": case.factory_capacity,
        "sector": case.sector,
        "charges_created": mca.get("charges_created"),
        "mca_red_flags": mca.get("red_flags", 0),
        "news_sentiment": research.get("news", {}).get("sentiment", "Neutral"),
        "_current_decision": case.decision,
    }
    if case.revenue and case.ebitda:
        baseline["ebitda_margin"] = round(case.ebitda / case.revenue * 100, 2)

    result = sensitivity(
        {"total": case.total_score},
        baseline,
        payload.model_dump(exclude_none=True),
    )
    result["baseline"] = {
        "total_score": case.total_score,
        "decision": case.decision,
        "recommended_limit_cr": case.recommended_limit_cr,
        "spread": case.spread,
    }
    return result
