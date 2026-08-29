"""
Golden tests for the decision engine.

This module is the reason the test suite exists. The engine decides whether a
borrower is approved, for how much and at what price; a silent regression here
is not a bug report, it is a wrong credit decision. Each test names the policy
it protects so a future change to a constant fails with an explanation rather
than a bare assertion error.
"""

import pytest

from app.analysis import policy
from app.analysis.decision_engine import (
    breakeven_analysis,
    build_covenants,
    decide_application,
    evaluate_gates,
    price_facility,
    sensitivity,
    size_limit,
)


def _bankable_case(**overrides) -> dict:
    """A borrower that clears every gate, so each test can break exactly one."""
    data = {
        "revenue": 120.0,
        "ebitda": 18.0,
        "dscr": 1.60,
        "interest_coverage": 4.2,
        "debt_equity": 1.10,
        "net_worth": 45.0,
        "promoter_stake": 0.62,
        "promoter_pledge": 0.05,
        "collateral_value": 40.0,
        "security_cover": 1.80,
        "existing_limits": 22.0,
        "cibil_score": 760,
        "cibil_dpd_30": 0,
        "litigation_count": 0,
        "bounce_count": 0,
        "circular_trading_pct": 2.0,
        "related_party_flag": False,
        "sector": "Manufacturing",
    }
    data.update(overrides)
    return data


def _scores(total: float = 78.0) -> dict:
    return {"total": total, "collateral": 12.0}


# ---------------------------------------------------------------------------
# Gates
# ---------------------------------------------------------------------------

def test_clean_case_breaches_no_gate():
    gates = evaluate_gates(_scores(), _bankable_case())
    assert [g["code"] for g in gates if g["breached"]] == []


def test_composite_below_cut_off_breaches_the_score_gate():
    gates = evaluate_gates(_scores(policy.MIN_TOTAL_SCORE - 0.1), _bankable_case())
    breached = {g["code"] for g in gates if g["breached"]}
    assert "SCORE" in breached


def test_score_exactly_at_the_cut_off_passes():
    """The cut-off is a floor, not a threshold to exceed."""
    gates = evaluate_gates(_scores(policy.MIN_TOTAL_SCORE), _bankable_case())
    assert not next(g for g in gates if g["code"] == "SCORE")["breached"]


def test_dscr_below_the_floor_breaches():
    gates = evaluate_gates(_scores(), _bankable_case(dscr=policy.MIN_DSCR - 0.01))
    assert next(g for g in gates if g["code"] == "DSCR")["breached"]


def test_absent_dscr_does_not_breach_but_is_reported_as_untested():
    """
    A missing figure must not be scored as a failure. Rejecting a borrower for
    a document they were never asked for is the failure mode this guards.
    """
    data = _bankable_case()
    data.pop("dscr")
    gate = next(g for g in evaluate_gates(_scores(), data) if g["code"] == "DSCR")
    assert gate["breached"] is False
    assert "could not be tested" in gate["detail"]


def test_dscr_falls_back_to_the_bank_statement_figure():
    data = _bankable_case()
    data.pop("dscr")
    data["observed_dscr"] = 0.90
    assert next(g for g in evaluate_gates(_scores(), data) if g["code"] == "DSCR")["breached"]


def test_litigation_ceiling_is_inclusive():
    at_ceiling = evaluate_gates(
        _scores(), _bankable_case(litigation_count=policy.MAX_LITIGATION)
    )
    below = evaluate_gates(
        _scores(), _bankable_case(litigation_count=policy.MAX_LITIGATION - 1)
    )
    assert next(g for g in at_ceiling if g["code"] == "LITIGATION")["breached"]
    assert not next(g for g in below if g["code"] == "LITIGATION")["breached"]


def test_promoter_pledge_breach_is_a_warning_not_a_rejection():
    """A heavy pledge conditions the sanction; it does not by itself reject."""
    data = _bankable_case(promoter_pledge=0.80)
    gate = next(g for g in evaluate_gates(_scores(), data) if g["code"] == "PLEDGE")
    assert gate["breached"] and gate["severity"] == "warning"
    assert decide_application(_scores(), data)["decision"] == "APPROVE"


# ---------------------------------------------------------------------------
# Limit sizing
# ---------------------------------------------------------------------------

def test_limit_is_the_tightest_of_the_three_methods():
    result = size_limit(_bankable_case())
    # turnover 120 * 0.25 = 30.0 | cash flow 18 / 1.25 = 14.4 | collateral 40 * 0.7 = 28.0
    assert result["recommended_limit_cr"] == pytest.approx(14.4)
    assert result["binding_constraint"] == "Cash flow method"


def test_binding_flag_is_set_on_exactly_one_constraint():
    result = size_limit(_bankable_case())
    assert sum(1 for c in result["constraints"] if c.get("binding")) == 1


def test_missing_figures_mark_a_constraint_unavailable_rather_than_zero():
    """
    A constraint that cannot be computed must not sink the limit to zero -
    that would present an absent document as an assessed constraint of nil.
    """
    data = _bankable_case()
    data.pop("ebitda")
    result = size_limit(data)
    cash_flow = next(c for c in result["constraints"] if c["basis"] == "Cash flow method")
    assert cash_flow["available"] is False and cash_flow["value_cr"] is None
    assert result["recommended_limit_cr"] == pytest.approx(28.0)


def test_no_computable_constraint_refers_rather_than_approving():
    data = {"sector": "Manufacturing", "dscr": 1.5, "litigation_count": 0}
    outcome = decide_application(_scores(), data)
    assert outcome["decision"] == "REFER"
    assert outcome["recommended_limit_cr"] is None


# ---------------------------------------------------------------------------
# Whole-decision behaviour
# ---------------------------------------------------------------------------

def test_bankable_case_is_approved_priced_and_sized():
    outcome = decide_application(_scores(), _bankable_case())
    assert outcome["decision"] == "APPROVE"
    assert outcome["recommended_limit_cr"] == pytest.approx(14.4)
    assert outcome["spread"].startswith("Repo +")


def test_rejection_withholds_both_the_limit_and_a_price():
    outcome = decide_application(_scores(40.0), _bankable_case())
    assert outcome["decision"] == "REJECT"
    assert outcome["recommended_limit_cr"] is None
    assert outcome["spread"] == "Not priced"


def test_rejection_reason_names_every_breached_gate():
    outcome = decide_application(_scores(40.0), _bankable_case(litigation_count=5))
    assert "Composite" in outcome["reason"] and "adverse matter" in outcome["reason"]


def test_thin_security_cover_widens_the_spread():
    wide = price_facility(78.0, "APPROVE", security_cover=1.0)
    normal = price_facility(78.0, "APPROVE", security_cover=2.0)
    assert wide["spread"] != normal["spread"]
    assert "thin security cover" in wide["basis"]


# ---------------------------------------------------------------------------
# Covenants
# ---------------------------------------------------------------------------

def test_weak_dscr_attracts_a_debt_service_reserve():
    covenants = build_covenants(_scores(), _bankable_case(dscr=1.15))
    assert any(
        c["covenant"] == "Debt service reserve account"
        for c in covenants["financial_covenants"]
    )


def test_strong_dscr_attracts_no_reserve_covenant():
    covenants = build_covenants(_scores(), _bankable_case(dscr=1.90))
    assert not any(
        c["covenant"] == "Debt service reserve account"
        for c in covenants["financial_covenants"]
    )


def test_cheque_returns_attract_a_conduct_condition():
    covenants = build_covenants(_scores(), _bankable_case(bounce_count=2))
    assert any(
        "clean banking conduct" in c["condition"]
        for c in covenants["conditions_precedent"]
    )


def test_every_covenant_states_the_weakness_it_answers():
    """A covenant with no stated reason cannot be defended to a borrower."""
    covenants = build_covenants(_scores(), _bankable_case(bounce_count=1, dscr=1.15))
    for group in ("financial_covenants", "conditions_precedent"):
        assert all(item.get("reason") for item in covenants[group])


# ---------------------------------------------------------------------------
# Sensitivity and break-even
# ---------------------------------------------------------------------------

def test_sensitivity_reports_a_decision_flip():
    data = _bankable_case(dscr=0.80)
    data["_current_decision"] = "REJECT"
    result = sensitivity({"total": 55.0}, data, {"dscr": 1.80, "cibil_score": 810})
    assert result["delta"]["decision_changed"] is True


def test_sensitivity_does_not_mutate_the_baseline():
    data = _bankable_case()
    before = dict(data)
    sensitivity({"total": 78.0}, data, {"revenue": 999.0})
    assert data == before


def test_breakeven_reports_the_gap_to_each_gate():
    result = breakeven_analysis({"total": 52.0}, {"dscr": 0.95, "litigation_count": 4})
    assert result["score"]["cleared"] is False
    assert result["score"]["gap"] == pytest.approx(policy.MIN_TOTAL_SCORE - 52.0)
    assert result["dscr"]["cleared"] is False
    assert result["litigation"]["cleared"] is False
