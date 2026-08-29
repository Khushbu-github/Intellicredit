"""Reference data, so the UI never hard-codes a policy constant."""

from fastapi import APIRouter

from app.analysis import policy
from app.config import settings
from app.llm.client import is_enabled as llm_enabled
from app.research.mock_research import SECTORS
from app.services.pipeline import DOC_LABELS
from app.services.storage import ALLOWED_EXTENSIONS

router = APIRouter(tags=["meta"])


@router.get("/meta")
def get_meta() -> dict:
    return {
        "sectors": SECTORS,
        "pillar_weights": policy.PILLAR_WEIGHTS,
        "document_types": DOC_LABELS,
        "policy": {
            "min_total_score": policy.MIN_TOTAL_SCORE,
            "min_dscr": policy.MIN_DSCR,
            "comfort_dscr": policy.COMFORT_DSCR,
            "max_litigation": policy.MAX_LITIGATION,
            "max_circular_trading_pct": policy.MAX_CIRCULAR_TRADING_PCT,
            "max_promoter_pledge": policy.MAX_PROMOTER_PLEDGE,
            "turnover_multiple": policy.TURNOVER_MULTIPLE,
            "cash_flow_multiple": policy.CASH_FLOW_MULTIPLE,
            "collateral_advance_rate": policy.COLLATERAL_ADVANCE_RATE,
        },
        "upload": {
            "allowed_extensions": sorted(ALLOWED_EXTENSIONS),
            "max_bytes": settings.MAX_UPLOAD_BYTES,
            "max_files_per_request": settings.MAX_FILES_PER_REQUEST,
        },
        # The UI hides the model-assisted panels when the key is absent, rather
        # than offering a button that would silently do nothing.
        "features": {"llm_assist": llm_enabled()},
    }
