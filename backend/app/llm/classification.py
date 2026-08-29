"""
LLM document classification.

The filename rules in app/services/pipeline.py run first and are free. This
is the fallback for the case they cannot handle: a correctly-formatted GST
return that arrives as 'Scan_0042.pdf'. Before this existed such a file was
classified 'unclassified' and silently dropped out of scoring, which meant a
case could be decided on less evidence than the analyst had actually supplied.

The model chooses from a closed set and must return 'unclassified' when it is
unsure, so a low-confidence guess cannot route a document to the wrong parser.
"""

from __future__ import annotations

import logging
from typing import Literal

from pydantic import BaseModel, Field

from app.config import settings
from app.llm.client import parse_structured

logger = logging.getLogger(__name__)

DocType = Literal[
    "annual", "gst", "bank", "sanction", "legal", "rating",
    "board", "cibil", "shareholding", "itr", "unclassified",
]

CLASSIFICATION_SYSTEM = """\
You classify documents submitted to an Indian corporate credit appraisal file.

Choose exactly one type:
- annual: audited financial statements, annual report, balance sheet, P&L
- gst: GSTR-1/3B returns or a GST sales/purchase register
- bank: a bank account statement of transactions
- sanction: an existing lender's sanction or facility letter
- legal: a legal notice, summons, or court filing (e.g. NI Act s138)
- rating: a credit rating agency report or rating rationale
- board: board or committee meeting minutes, or a directors' report
- cibil: a commercial credit bureau report
- shareholding: a shareholding or share-pledge pattern
- itr: an income tax return summary or computation of income
- unclassified: anything else, OR anything you are not confident about

Return 'unclassified' whenever confidence is below 0.7. Misrouting a document \
to the wrong parser corrupts the appraisal; declining to classify does not."""


class DocumentClassification(BaseModel):
    doc_type: DocType = Field(description="The single best-matching document type.")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence between 0 and 1.")
    reason: str = Field(
        max_length=200, description="One short sentence citing what in the text decided it."
    )


CONFIDENCE_THRESHOLD = 0.7
MAX_SAMPLE_CHARS = 6000


def classify_via_llm(filename: str, sample_text: str) -> dict | None:
    """
    Classify a document the filename rules could not place.

    Returns {'doc_type', 'confidence', 'reason'} or None when the model is
    disabled, failed, or was not confident enough to be useful.
    """
    if not sample_text or not sample_text.strip():
        return None

    result = parse_structured(
        system=CLASSIFICATION_SYSTEM,
        user_content=(
            f"Filename: {filename}\n\n"
            f"<document_start>\n{sample_text[:MAX_SAMPLE_CHARS]}\n</document_start>"
        ),
        schema=DocumentClassification,
        effort=settings.LLM_EFFORT_MECHANICAL,
        cache_system=True,
    )
    if result is None:
        return None

    if result.doc_type == "unclassified" or result.confidence < CONFIDENCE_THRESHOLD:
        logger.info(
            "LLM classification for %s not confident enough (%s @ %.2f).",
            filename, result.doc_type, result.confidence,
        )
        return None

    return {
        "doc_type": result.doc_type,
        "confidence": round(result.confidence, 2),
        "reason": result.reason,
    }
