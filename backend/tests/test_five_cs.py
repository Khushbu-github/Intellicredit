"""
5Cs scoring.

The property these tests protect is the one the whole product rests on:
a missing document must never be scored as a failure, and the breakdown must
always disclose which components rested on real evidence.
"""

import pytest

from app.analysis.five_cs import calculate_5cs_scores, risk_grade
from app.analysis.policy import PILLAR_WEIGHTS


def _full_evidence() -> dict:
    return {
        "cibil_score": 820, "cibil_dpd_30": 0, "litigation_count": 0,
        "bounce_count": 0, "related_party_flag": False, "mca_red_flags": 0,
        "revenue": 120.0, "ebitda": 18.0, "ebitda_margin": 15.0, "dscr": 1.8,
        "interest_coverage": 5.0, "debt_equity": 0.8, "net_worth": 45.0,
        "promoter_stake": 0.65, "promoter_pledge": 0.0,
        "collateral_value": 60.0, "security_cover": 2.5, "existing_limits": 22.0,
        "external_rating": "AA-", "rating_outlook": "Stable",
        "circular_trading_pct": 0.0, "customer_concentration_pct": 15.0,
        "news_sentiment": "Positive", "charges_created": 2, "sector": "Manufacturing",
        "factory_capacity": 85.0,
    }


def test_pillar_weights_sum_to_one_hundred():
    assert sum(PILLAR_WEIGHTS.values()) == 100


def test_no_pillar_can_exceed_its_weight():
    scores = calculate_5cs_scores(_full_evidence())
    for pillar, weight in PILLAR_WEIGHTS.items():
        assert 0 <= scores[pillar] <= weight, pillar


def test_total_is_the_sum_of_the_pillars():
    scores = calculate_5cs_scores(_full_evidence())
    assert scores["total"] == pytest.approx(
        sum(scores[p] for p in PILLAR_WEIGHTS), abs=0.05
    )


def test_an_empty_case_scores_without_crashing():
    scores = calculate_5cs_scores({})
    assert 0 <= scores["total"] <= 100


def test_a_strong_borrower_outscores_a_weak_one():
    strong = calculate_5cs_scores(_full_evidence())
    weak = calculate_5cs_scores({
        **_full_evidence(),
        "cibil_score": 520, "cibil_dpd_30": 3, "litigation_count": 4,
        "bounce_count": 5, "dscr": 0.7, "debt_equity": 6.0,
        "promoter_pledge": 0.9, "collateral_value": 1.0, "security_cover": 0.2,
        "circular_trading_pct": 45.0, "news_sentiment": "Negative",
        "related_party_flag": True,
    })
    assert strong["total"] > weak["total"]


def test_missing_evidence_scores_between_the_best_and_worst_case():
    """
    An absent document must be neither rewarded nor treated as proof of
    failure - otherwise the engine punishes borrowers for paperwork the bank
    never asked for.
    """
    best = calculate_5cs_scores(_full_evidence())["character"]
    absent = calculate_5cs_scores({**_full_evidence(), "cibil_score": None})
    worst = calculate_5cs_scores({**_full_evidence(), "cibil_score": 0})["character"]

    assert worst < absent["character"] < best


def test_absent_figures_are_flagged_as_unevidenced_in_the_breakdown():
    data = _full_evidence()
    data.pop("cibil_score")
    breakdown = calculate_5cs_scores(data)["breakdown"]["character"]

    bureau = next(c for c in breakdown["components"] if c["label"] == "Bureau score")
    assert bureau["evidenced"] is False
    assert "No CIBIL" in bureau["basis"]


def test_every_component_carries_its_own_basis():
    """A score with no stated basis cannot be explained to a credit committee."""
    breakdown = calculate_5cs_scores(_full_evidence())["breakdown"]
    for pillar, detail in breakdown.items():
        assert detail["components"], pillar
        for component in detail["components"]:
            assert component["basis"], f"{pillar}/{component['label']}"
            assert component["points"] <= component["max"]


def test_evidence_coverage_falls_as_documents_are_removed():
    full = calculate_5cs_scores(_full_evidence())["evidence_coverage"]
    sparse = calculate_5cs_scores({"sector": "Manufacturing"})["evidence_coverage"]
    assert sparse < full


def test_dscr_falls_back_to_observed_flows_and_says_so():
    data = _full_evidence()
    data.pop("dscr")
    data["observed_dscr"] = 1.4

    capacity = calculate_5cs_scores(data)["breakdown"]["capacity"]
    component = next(
        c for c in capacity["components"] if c["label"] == "Debt service coverage"
    )
    assert "bank statement flows" in component["basis"]
    assert "1.40x" in component["basis"]


@pytest.mark.parametrize(
    "total, expected_prefix",
    [(92, "IC-1"), (78, "IC-2"), (68, "IC-3"), (61, "IC-4"), (50, "IC-5"), (20, "IC-6")],
)
def test_risk_grade_bands(total, expected_prefix):
    assert risk_grade(total).startswith(expected_prefix)


def test_risk_grade_is_monotonic():
    grades = [risk_grade(t) for t in range(0, 101, 5)]
    assert grades[0].startswith("IC-6") and grades[-1].startswith("IC-1")
