"""
Ingestion, classification and whole-case recomputation.

Includes the regression test for the field-note override path, which used to
patch the engine's output after the fact and could therefore leave a case
whose recorded gates disagreed with its own recommendation.
"""

import pandas as pd
import pytest

from app.analysis import policy
from app.services.pipeline import (
    _sniff_csv_type,
    apply_note_penalties,
    classify,
    recompute,
)

# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "filename, expected",
    [
        ("annual_report_2026.pdf", "annual"),
        ("gstr3b_q1.csv", "gst"),
        ("gst_3b.pdf", "gst"),
        ("hdfc_bank_statement.csv", "bank"),
        ("sanction_letter.pdf", "sanction"),
        ("legal_notice_138.pdf", "legal"),
        ("crisil_rating_report.pdf", "rating"),
        ("board_minutes_march.pdf", "board"),
        ("cibil_commercial.json", "cibil"),
        ("shareholding_pattern.csv", "shareholding"),
        ("itr_summary.csv", "itr"),
        ("Scan_0042.pdf", "unclassified"),
        ("holiday_photo.png", "unclassified"),
    ],
)
def test_filename_classification(filename, expected):
    assert classify(filename) == expected


@pytest.mark.parametrize(
    "columns, expected",
    [
        (["Type", "GSTIN", "Amount", "Date"], "gst"),
        (["Entity", "Stake", "Pledged"], "shareholding"),
        (["Year", "TotalIncome", "TaxPaid"], "itr"),
        (["Date", "Description", "Amount", "Type"], "bank"),
        (["Colour", "Size"], None),
    ],
)
def test_csv_column_sniffing_rescues_badly_named_files(columns, expected):
    """
    A correctly-formatted register that arrives as 'export_final(2).csv' used
    to be classified 'unclassified' and dropped silently out of scoring.
    """
    assert _sniff_csv_type(pd.DataFrame(columns=columns)) == expected


# ---------------------------------------------------------------------------
# Field-note overrides
# ---------------------------------------------------------------------------

def _scores(**overrides) -> dict:
    scores = {
        "character": 20.0, "capacity": 25.0, "capital": 16.0,
        "collateral": 12.0, "conditions": 8.0, "total": 81.0,
        "risk_grade": "IC-2 (Low risk)",
    }
    scores.update(overrides)
    return scores


def test_notes_with_no_keywords_change_nothing():
    scores, applied = apply_note_penalties(_scores(), "Factory visited, all in order.")
    assert applied == [] and scores == _scores()


def test_empty_notes_change_nothing():
    for notes in (None, "", "   "):
        scores, applied = apply_note_penalties(_scores(), notes)
        assert applied == []


def test_under_utilisation_penalises_capacity_and_lowers_the_total():
    scores, applied = apply_note_penalties(
        _scores(), "Plant is heavily underutilised at present."
    )
    assert scores["capacity"] == 20.0
    assert scores["total"] == 76.0
    assert len(applied) == 1


def test_fund_diversion_penalises_character():
    scores, applied = apply_note_penalties(_scores(), "Suspected diversion of funds.")
    assert scores["character"] == 12.0
    assert "diversion" in applied[0].lower()


def test_multiple_keywords_stack():
    scores, applied = apply_note_penalties(
        _scores(), "Underutilised plant and weak management throughout."
    )
    assert len(applied) == 2
    assert scores["capacity"] == 20.0 and scores["character"] == 15.0


def test_a_pillar_can_never_be_driven_below_zero():
    scores, _ = apply_note_penalties(_scores(character=1.0), "Suspected siphoning.")
    assert scores["character"] == 0.0


def test_penalties_do_not_mutate_the_input_scores():
    original = _scores()
    snapshot = dict(original)
    apply_note_penalties(original, "Underutilised.")
    assert original == snapshot


def test_the_grade_is_recomputed_from_the_adjusted_total():
    scores, _ = apply_note_penalties(
        _scores(), "Suspected diversion and weak management and underutilised."
    )
    assert scores["total"] == 81.0 - 8 - 5 - 5
    assert scores["risk_grade"] != _scores()["risk_grade"]


# ---------------------------------------------------------------------------
# Whole-case recomputation
# ---------------------------------------------------------------------------

class _FakeCase:
    """A stand-in for the ORM row: recompute() only reads attributes."""

    def __init__(self, **kwargs):
        self.company_name = "Vishwakarma Steel Ltd"
        self.sector = "Manufacturing"
        self.decision = None
        self.total_score = None
        self.factory_capacity = None
        self.mgmt_quality = None
        self.qualitative_notes = None
        self.__dict__.update(kwargs)


class _FakeDoc:
    def __init__(self, doc_type, extracted, parse_status="parsed"):
        self.doc_type = doc_type
        self.extracted = extracted
        self.parse_status = parse_status


def _strong_documents():
    return [
        _FakeDoc("annual", {
            "revenue": 120.0, "ebitda": 18.0, "dscr": 1.60,
            "interest_expense": 4.0, "total_debt": 50.0, "net_worth": 45.0,
        }),
        _FakeDoc("sanction", {"existing_limits": 22.0, "collateral_value": 40.0}),
        _FakeDoc("cibil", {"cibil_score": 780, "cibil_dpd_30": 0}),
        _FakeDoc("shareholding", {"promoter_stake": 0.62, "promoter_pledge": 0.05}),
    ]


def test_recompute_produces_a_complete_scored_case():
    fields, event = recompute(_FakeCase(), _strong_documents())

    assert fields["status"] == "Analyzed"
    assert 0 <= fields["total_score"] <= 100
    assert fields["decision"] in ("APPROVE", "REJECT", "REFER")
    assert fields["score_breakdown"] and fields["limit_working"] and fields["covenants"]
    assert event["summary"] and event["detail"]["gates"]


def test_recompute_is_idempotent():
    """
    Re-analysing a case must produce the same answer, not double-count. The
    engine rebuilds from the stored documents rather than incrementing
    counters, which an earlier accumulate-on-upload design got wrong.
    """
    documents = _strong_documents()
    first, _ = recompute(_FakeCase(), documents)
    second, _ = recompute(_FakeCase(), documents)

    for key in ("total_score", "decision", "litigation_count", "bounce_count",
                "recommended_limit_cr", "risk_grade"):
        assert first[key] == second[key], key


def test_litigation_is_recounted_not_accumulated():
    documents = _strong_documents() + [
        _FakeDoc("legal", {"is_ni_138": True}),
        _FakeDoc("legal", {"is_ni_138": True}),
    ]
    first, _ = recompute(_FakeCase(), documents)
    second, _ = recompute(_FakeCase(total_score=first["total_score"]), documents)
    assert first["litigation_count"] == second["litigation_count"]


def test_field_notes_are_reapplied_on_every_recompute():
    """An override must survive a re-analysis, not be lost on the next run."""
    case = _FakeCase(qualitative_notes="Plant badly underutilised.")
    first, _ = recompute(case, _strong_documents())
    second, _ = recompute(case, _strong_documents())
    assert first["capacity_score"] == second["capacity_score"]
    assert "Field notes applied" in second["decision_reason"]


def test_field_notes_that_reject_a_case_also_withdraw_the_limit_and_gates():
    """
    Regression: the override path used to patch the engine's output after the
    fact, re-checking only the score gate. A case could therefore record
    'REJECT' while its stored gates still showed the score gate as cleared,
    and while carrying a limit and covenant package sized on the higher score.
    """
    notes = "Suspected diversion of funds, weak management, plant underutilised."
    fields, event = recompute(
        _FakeCase(qualitative_notes=notes), _strong_documents()
    )

    score_gate = next(g for g in fields["raw_data"]["gates"] if g["code"] == "SCORE")

    if fields["total_score"] < policy.MIN_TOTAL_SCORE:
        assert fields["decision"] == "REJECT"
        assert fields["recommended_limit_cr"] is None
        assert fields["spread"] == "Not priced"
        # The gates must describe the score the decision was actually made on.
        assert score_gate["breached"] is True
        assert f"{fields['total_score']:.1f}" in score_gate["detail"]
    else:
        assert score_gate["breached"] is False

    assert event["detail"]["overrides"]


def test_gates_always_agree_with_the_recorded_decision():
    """Whatever the notes do, the audit trail must not contradict the outcome."""
    for notes in (None, "All fine.", "Underutilised.",
                  "Suspected siphoning and weak management and underutilised."):
        fields, _ = recompute(_FakeCase(qualitative_notes=notes), _strong_documents())
        critical_breached = any(
            g["breached"] and g["severity"] == "critical"
            for g in fields["raw_data"]["gates"]
        )
        assert (fields["decision"] == "REJECT") == critical_breached, notes


def test_a_case_with_no_documents_still_scores_without_crashing():
    fields, _ = recompute(_FakeCase(), [])
    assert fields["total_score"] is not None
    # Nothing was evidenced, so no limit can be sized from documents.
    assert fields["decision"] in ("REJECT", "REFER")
