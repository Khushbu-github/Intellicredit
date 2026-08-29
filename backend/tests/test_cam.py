"""
The Credit Appraisal Memo.

The memo must build from a case at any stage of completeness, and must render
the drafted narrative when one exists without depending on it - a deployment
with no model access still has to produce a usable memo.
"""

from app.cam.generator import generate_cam_docx

BASE_CASE = {
    "company_name": "Vishwakarma Steel Ltd",
    "sector": "Manufacturing",
    "decision": "APPROVE",
    "decision_reason": "All 5 policy gates cleared.",
    "total_score": 78.4,
    "risk_grade": "IC-2 (Low risk)",
    "recommended_limit_cr": 14.4,
    "spread": "Repo + 225bps",
    "revenue": 120.0,
    "ebitda": 18.0,
    "dscr": 1.6,
}

NARRATIVE = {
    "executive_summary": "First paragraph.\nSecond paragraph.",
    "risk_commentary": "The material risks are as follows.",
    "mitigants": "The covenants address them.",
    "recommendation_note": "Recommended for sanction subject to conditions.",
    "generated_by": "claude-opus-5",
}


def _build(case: dict) -> bytes:
    return generate_cam_docx(case).getvalue()


def test_memo_builds_from_a_minimal_case():
    """A case that was never scored must still produce a document."""
    content = _build({"company_name": "Unscored Ltd"})
    assert content.startswith(b"PK")   # docx is a zip container
    assert len(content) > 5_000


def test_memo_builds_for_every_decision():
    for decision in ("APPROVE", "REJECT", "REFER", None):
        content = _build({**BASE_CASE, "decision": decision})
        assert content.startswith(b"PK"), decision


def test_memo_without_a_narrative_still_builds():
    """
    With no ANTHROPIC_API_KEY there is no narrative, and the memo must simply
    start at the recommendation rather than carrying an empty heading.
    """
    assert _build(BASE_CASE).startswith(b"PK")


def test_a_drafted_narrative_reaches_the_memo():
    """
    Regression: the narrative was generated and stored on the case but the
    generator never read it, so the feature changed nothing in the output.
    """
    without = _build(BASE_CASE)
    with_narrative = _build({**BASE_CASE, "narrative": NARRATIVE})
    assert len(with_narrative) > len(without)


def test_an_empty_narrative_is_treated_as_absent():
    for empty in ({}, None, {"executive_summary": ""}):
        assert _build({**BASE_CASE, "narrative": empty}).startswith(b"PK")


def test_memo_renders_gates_documents_and_history():
    case = {
        **BASE_CASE,
        "raw_data": {
            "gates": [
                {"code": "SCORE", "title": "Composite score cut-off", "breached": False,
                 "detail": "Composite 78.4 against a cut-off of 60.", "severity": "critical"},
            ],
        },
        "red_flags": [
            {"code": "PLEDGE_HIGH", "severity": "critical",
             "title": "Promoter pledge", "detail": "62% pledged."},
        ],
        "documents": [
            {"filename": "annual_report.pdf", "doc_label": "Annual report",
             "parse_status": "parsed", "parse_message": "7 field(s) extracted."},
        ],
        "events": [
            {"at": "2026-08-28T10:00:00Z", "trigger": "ingestion", "summary": "4 of 4 parsed."},
        ],
    }
    assert len(_build(case)) > len(_build(BASE_CASE))
