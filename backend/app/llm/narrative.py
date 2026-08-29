"""
LLM-drafted narrative sections for the Credit Appraisal Memo.

The decision, the score, the limit and the covenants are all produced by the
deterministic engine before this module is called. The model's only job is to
write the prose a credit officer would write around figures that have already
been decided. It is explicitly forbidden from changing, recomputing or
contradicting any of them.

This split is the point. A bank cannot defend "the model approved it", but it
can defend "the policy engine approved it and the model wrote the summary" -
the reasoning stays auditable and reproducible, and the memo still reads like
a person wrote it rather than a template.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.config import settings
from app.llm.client import compact_json, parse_structured

NARRATIVE_SYSTEM = """\
You are a senior credit officer at an Indian commercial bank, drafting the \
narrative sections of a Credit Appraisal Memo (CAM).

The recommendation, composite score, policy gates, sanctioned limit and \
covenants have ALREADY been decided by the bank's policy engine. They are \
given to you as fact.

Absolute rules:
- NEVER contradict, re-derive, soften or second-guess the stated decision.
- NEVER state a number that is not present in the supplied case data. Do not \
round differently, annualise, or compute new ratios.
- Where the data shows a field as null or absent, write that it was not \
evidenced. Do not fill the gap with an assumption.
- Refer to amounts in Rs Crore exactly as supplied.

Style: measured, specific, and written for a credit committee. Reference the \
actual gates and flags in the data. No marketing language, no hedging \
filler, no bullet-point padding. Indian banking conventions throughout."""


class CamNarrative(BaseModel):
    """The prose sections that wrap the computed figures in the memo."""

    executive_summary: str = Field(
        max_length=1800,
        description=(
            "Two to three paragraphs: who the borrower is, what the recommendation "
            "is and the single most important reason for it, and the headline "
            "financial position."
        ),
    )
    risk_commentary: str = Field(
        max_length=1800,
        description=(
            "The material risks in this specific case, grounded in the red flags "
            "and breached gates actually present. Name each risk and what evidence "
            "raised it."
        ),
    )
    mitigants: str = Field(
        max_length=1200,
        description=(
            "How the proposed covenants, conditions precedent and security address "
            "the risks named above. If a risk is unmitigated, say so plainly."
        ),
    )
    recommendation_note: str = Field(
        max_length=800,
        description=(
            "A closing paragraph restating the recommendation and the conditions "
            "attached to it, addressed to the sanctioning authority."
        ),
    )


# Only the fields the narrative may reference. Passing the whole ORM row would
# put internal ids and timestamps in the prompt for no benefit, and would make
# the cached prefix churn on every save.
_NARRATIVE_FIELDS = (
    "company_name", "sector", "decision", "decision_reason", "total_score",
    "risk_grade", "recommended_limit_cr", "spread", "revenue", "ebitda", "dscr",
    "interest_coverage", "debt_equity", "net_worth", "promoter_stake",
    "promoter_pledge", "collateral_value", "security_cover", "existing_limits",
    "cibil_score", "cibil_dpd_30", "external_rating", "rating_outlook",
    "litigation_count", "bounce_count", "gst_circular_trading_pct",
    "gst_turnover_mismatch_pct", "related_party_flag", "character_score",
    "capacity_score", "capital_score", "collateral_score", "conditions_score",
    "red_flags", "limit_working", "covenants", "qualitative_notes",
)


def build_case_context(payload: dict) -> dict:
    """Reduce a case payload to the fields the narrative is allowed to cite."""
    context = {k: payload.get(k) for k in _NARRATIVE_FIELDS if k in payload}
    raw = payload.get("raw_data") or {}
    context["policy_gates"] = raw.get("gates")
    context["evidence_coverage"] = raw.get("evidence_coverage")
    return context


def draft_narrative(payload: dict) -> dict | None:
    """
    Draft the memo's prose sections. Returns None if the model is unavailable,
    in which case the CAM generator falls back to its template sentences.
    """
    context = build_case_context(payload)

    result = parse_structured(
        system=NARRATIVE_SYSTEM,
        user_content=(
            "Draft the narrative sections of the CAM for this case.\n\n"
            f"<case_data>\n{compact_json(context)}\n</case_data>"
        ),
        schema=CamNarrative,
        effort=settings.LLM_EFFORT_ANALYTICAL,
        cache_system=True,
    )
    if result is None:
        return None

    drafted = result.model_dump()
    drafted["generated_by"] = settings.LLM_MODEL
    return drafted
