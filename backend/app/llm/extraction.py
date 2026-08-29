"""
LLM extraction fallback for financial documents.

The regex parsers in app/ingest run first and are authoritative. This module
is only reached when they come back empty, which is the common case for
scanned or unusually formatted annual reports - exactly where a keyword
parser is weakest and a model is strongest.

Two rules make the output safe to score on:

1. Every figure the model returns is recorded with extraction_source="llm",
   so the audit trail and the evidence-coverage figure can distinguish a
   number read by a deterministic parser from one inferred by a model.
2. The schema makes every field optional and instructs the model to omit
   rather than estimate. A credit decision must never rest on a guessed
   revenue figure, so "not found" has to be an available answer.
"""

from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from app.config import settings
from app.llm.client import parse_structured

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM = """\
You extract figures from Indian corporate financial documents for a credit \
appraisal system. You are a careful reader, not an analyst.

Rules you must follow:
- Report ONLY figures that appear explicitly in the document text.
- If a figure is absent, omit the field. Never estimate, infer from context, \
or carry a number over from a different line item.
- All monetary amounts must be returned in Rs Crore. Convert if the document \
reports in lakhs (divide by 100), millions (multiply by 0.1) or absolute \
rupees (divide by 10,000,000). State the conversion in `notes`.
- Where a document shows multiple years, report the most recent full year.
- `going_concern_doubt` is true only if the auditor or the notes explicitly \
reference a material uncertainty over going concern.
- `audit_qualification` is true only for a qualified, adverse or disclaimed \
opinion. An unmodified opinion with an emphasis of matter is NOT a \
qualification.

Accuracy matters more than completeness. An omitted field is correct \
behaviour; a wrong figure is a credit decision made on false information."""


class ExtractedFinancials(BaseModel):
    """Figures the scorer can consume, all optional by design."""

    revenue: float | None = Field(
        default=None, description="Total revenue / turnover for the year, in Rs Crore."
    )
    ebitda: float | None = Field(
        default=None, description="EBITDA or operating profit before D&A, in Rs Crore."
    )
    interest_expense: float | None = Field(
        default=None, description="Finance costs / interest expense, in Rs Crore."
    )
    total_debt: float | None = Field(
        default=None, description="Total borrowings, long plus short term, in Rs Crore."
    )
    net_worth: float | None = Field(
        default=None, description="Shareholders' funds / total equity, in Rs Crore."
    )
    dscr: float | None = Field(
        default=None, description="Debt service coverage ratio, only if stated explicitly."
    )
    contingent_liabilities: float | None = Field(
        default=None, description="Contingent liabilities not provided for, in Rs Crore."
    )
    going_concern_doubt: bool = Field(
        default=False, description="A material uncertainty over going concern is disclosed."
    )
    audit_qualification: bool = Field(
        default=False, description="The audit opinion is qualified, adverse or disclaimed."
    )
    notes: str | None = Field(
        default=None,
        description="One sentence on units, conversions applied, or why fields were omitted.",
    )


# Fields that carry a figure the scoring model consumes. `notes` is commentary
# and the booleans default to False, so neither counts as evidence of a find.
_NUMERIC_FIELDS = (
    "revenue", "ebitda", "interest_expense", "total_debt", "net_worth",
    "dscr", "contingent_liabilities",
)

# Sending the entire annual report would be slow and mostly boilerplate. The
# figures the scorer needs are concentrated in the statements and the notes.
MAX_DOCUMENT_CHARS = 60000


def extract_financials_via_llm(text: str) -> dict | None:
    """
    Second-pass extraction over annual-report text.

    Returns a dict of found values (plus extraction_source='llm') or None if
    the model is disabled, failed, or found nothing usable.
    """
    if not text or not text.strip():
        return None

    excerpt = text[:MAX_DOCUMENT_CHARS]
    open_tag = '<document truncated="true">' if len(text) > MAX_DOCUMENT_CHARS else "<document>"

    result = parse_structured(
        system=EXTRACTION_SYSTEM,
        user_content=(
            "Extract the credit figures from this annual report.\n\n"
            f"{open_tag}\n{excerpt}\n</document>"
        ),
        schema=ExtractedFinancials,
        effort=settings.LLM_EFFORT_MECHANICAL,
        cache_system=True,
    )
    if result is None:
        return None

    payload = result.model_dump(exclude_none=True)

    found_numeric = [f for f in _NUMERIC_FIELDS if payload.get(f) is not None]
    found_flags = result.going_concern_doubt or result.audit_qualification
    if not found_numeric and not found_flags:
        logger.info("LLM extraction returned no figures; keeping the regex result.")
        return None

    payload["extraction_source"] = "llm"
    payload["llm_fields"] = found_numeric
    return payload
