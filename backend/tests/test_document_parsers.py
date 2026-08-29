"""
Text-level document parsers.

These are pure functions over extracted text, so they are cheap to pin down
precisely. The property under test throughout is that an absent figure is
omitted rather than returned as zero - a borrower whose revenue line could not
be read must not be scored as one that earned nothing.
"""

import pandas as pd
import pytest

from app.ingest.financial_analyzer import (
    analyze_cibil,
    analyze_itr,
    analyze_shareholding,
    derive_balance_sheet,
)
from app.ingest.gst_analyzer import analyze_bank_statement, analyze_gst
from app.ingest.pdf_parser import (
    parse_board_minutes,
    parse_financials,
    parse_legal_notice,
    parse_rating_report,
    parse_sanction_letter,
)

# ---------------------------------------------------------------------------
# Annual report
# ---------------------------------------------------------------------------

ANNUAL_TEXT = """
    VISHWAKARMA STEEL LIMITED - ANNUAL REPORT 2025-26

    Total Revenue: Rs 1,250.50 Crore
    EBITDA: Rs 187.25 Crore
    Finance Cost: Rs 42.00 Crore
    Total Borrowings: Rs 620.00 Crore
    Net worth: Rs 540.00 Crore
    DSCR: 1.65x
    Interest Coverage Ratio: 4.45x
    Debt to Equity Ratio: 1.15x
"""


def test_annual_report_figures_are_read():
    result = parse_financials(ANNUAL_TEXT)
    assert result["revenue"] == pytest.approx(1250.50)
    assert result["ebitda"] == pytest.approx(187.25)
    assert result["interest_expense"] == pytest.approx(42.00)
    assert result["net_worth"] == pytest.approx(540.00)
    assert result["dscr"] == pytest.approx(1.65)
    assert result["interest_coverage"] == pytest.approx(4.45)
    assert result["debt_equity"] == pytest.approx(1.15)


def test_lakhs_are_converted_to_crore():
    """A hundred lakh is one crore; mixing the two would be a 100x error."""
    result = parse_financials("Total Revenue: Rs 2,500 Lakhs")
    assert result["revenue"] == pytest.approx(25.0)


def test_absent_figures_are_omitted_not_zeroed():
    result = parse_financials("This document contains no financial figures at all.")
    for field in ("revenue", "ebitda", "dscr", "net_worth"):
        assert field not in result


def test_going_concern_doubt_is_detected():
    assert parse_financials(
        "The auditor has noted a material uncertainty related to going concern."
    )["going_concern_doubt"] is True


@pytest.mark.parametrize(
    "phrase", ["qualified opinion", "adverse opinion", "disclaimer of opinion"]
)
def test_audit_qualifications_are_detected(phrase):
    assert parse_financials(f"We express a {phrase} on these statements.")[
        "audit_qualification"
    ] is True


def test_a_clean_opinion_is_not_flagged_as_qualified():
    result = parse_financials("In our opinion the financial statements give a true view.")
    assert "audit_qualification" not in result


# ---------------------------------------------------------------------------
# Sanction letter, legal notice, rating report, board minutes
# ---------------------------------------------------------------------------

def test_sanction_letter_yields_limits_and_security():
    result = parse_sanction_letter(
        "Sanctioned Limit: Rs 220.00 Crore from State Bank\n"
        "Security value: Rs 400.00 Crore\n"
        "Covenant: Minimum DSCR of 1.25x to be maintained\n"
    )
    assert result["existing_limits"] == pytest.approx(220.0)
    assert result["collateral_value"] == pytest.approx(400.0)
    assert result["stated_covenants"]


def test_ni_138_notice_is_flagged():
    result = parse_legal_notice(
        "Notice under Section 138 of the Negotiable Instruments Act.\n"
        "Demand amount: Rs 2.50 Crore\n"
    )
    assert result["is_ni_138"] is True
    assert result["litigation_amount_cr"] == pytest.approx(2.50)


def test_an_ordinary_letter_is_not_flagged_as_litigation():
    assert parse_legal_notice("Thank you for your continued business.")["is_ni_138"] is False


def test_insolvency_reference_is_detected():
    assert parse_legal_notice("Petition admitted before the NCLT under IBC.")[
        "insolvency_reference"
    ] is True


def test_rating_report_yields_grade_and_outlook():
    result = parse_rating_report("Credit Rating: CRISIL AA- / Negative")
    assert result["external_rating"] == "AA-"
    assert result["rating_outlook"] == "Negative"
    assert result["investment_grade"] is True


def test_sub_investment_grade_is_marked_as_such():
    assert parse_rating_report("Rating: BB+ / Stable")["investment_grade"] is False


def test_rating_downgrade_is_detected():
    assert parse_rating_report(
        "Rating: A- / Negative. The agency has announced a downgrade."
    )["rating_downgrade"] is True


def test_board_minutes_surface_governance_flags():
    result = parse_board_minutes(
        "The board approved related party transactions with Promoter Holdings Pvt Ltd. "
        "The resignation of the auditor was noted."
    )
    assert result["related_party_flag"] is True
    assert result["auditor_resigned"] is True


def test_routine_minutes_raise_no_flags():
    assert parse_board_minutes("The board approved the minutes of the last meeting.") == {}


# ---------------------------------------------------------------------------
# GST and bank statement
# ---------------------------------------------------------------------------

def test_circular_trading_is_detected_from_overlapping_counterparties():
    df = pd.DataFrame([
        {"Type": "Sale", "GSTIN": "27AAAAA0000A1Z5", "Amount": 500000},
        {"Type": "Sale", "GSTIN": "27BBBBB1111B1Z2", "Amount": 300000},
        {"Type": "Purchase", "GSTIN": "27AAAAA0000A1Z5", "Amount": 450000},
        {"Type": "Purchase", "GSTIN": "27CCCCC2222C1Z3", "Amount": 200000},
    ])
    result = analyze_gst(df)
    assert result["circular_trading_pct"] > 0
    assert result["sales_counterparties"] == 2


def test_clean_gst_register_shows_no_circular_trading():
    df = pd.DataFrame([
        {"Type": "Sale", "GSTIN": "27AAAAA0000A1Z5", "Amount": 500000},
        {"Type": "Purchase", "GSTIN": "27ZZZZZ9999Z1Z9", "Amount": 200000},
    ])
    assert analyze_gst(df)["circular_trading_pct"] == 0


def test_cheque_returns_are_counted():
    df = pd.DataFrame([
        {"Date": "2026-02-01", "Description": "TRF FROM CLIENT A", "Amount": 100000, "Type": "CR"},
        {"Date": "2026-02-05", "Description": "CHQ RETURN - INSUFFICIENT FUNDS", "Amount": 50000, "Type": "DR"},
        {"Date": "2026-02-15", "Description": "NEFT BOUNCE FEE", "Amount": 500, "Type": "DR"},
    ])
    result = analyze_bank_statement(df)
    assert result["bounce_count"] == 2
    assert result["transaction_count"] == 3


# ---------------------------------------------------------------------------
# Structured filings
# ---------------------------------------------------------------------------

def test_shareholding_yields_promoter_stake_and_pledge_ratio():
    df = pd.DataFrame([
        {"Entity": "Promoter A", "Stake": 45, "Pledged": 20},
        {"Entity": "Public", "Stake": 55, "Pledged": 0},
    ])
    result = analyze_shareholding(df)
    assert result["promoter_stake"] == pytest.approx(0.45)
    assert result["promoter_pledge"] == pytest.approx(0.20)


def test_shareholding_without_the_expected_columns_reports_failure():
    assert analyze_shareholding(pd.DataFrame([{"Colour": "blue"}]))[
        "shareholding_parsed"
    ] is False


def test_itr_summary_is_read_and_converted_to_crore():
    df = pd.DataFrame([{"Year": "AY2025-26", "TotalIncome": 1250000000, "TaxPaid": 300000000}])
    result = analyze_itr(df)
    assert result["itr_income_cr"] == pytest.approx(125.0)
    assert result["effective_tax_rate"] == pytest.approx(24.0)


def test_cibil_json_is_read():
    result = analyze_cibil(b'{"score": 742, "dpd_30": 1, "total_enquiries": 4}')
    assert result["cibil_score"] == 742
    assert result["cibil_dpd_30"] == 1
    assert result["cibil_enquiries"] == 4


def test_malformed_cibil_json_reports_failure_rather_than_raising():
    result = analyze_cibil(b"{not json")
    assert result["cibil_parsed"] is False and result["cibil_error"]


def test_cibil_score_is_never_defaulted_when_absent():
    """An earlier build assumed 700 for every borrower with no bureau pull."""
    assert "cibil_score" not in analyze_cibil(b'{"unrelated": true}')


def test_derived_ratios_need_both_of_their_inputs():
    assert derive_balance_sheet({"revenue": 100.0, "ebitda": 15.0})["ebitda_margin"] == 15.0
    assert "ebitda_margin" not in derive_balance_sheet({"revenue": 100.0})
    assert "interest_coverage" not in derive_balance_sheet({"ebitda": 15.0})


def test_debt_equity_is_not_derived_from_a_zero_equity_base():
    """Dividing by a zero net worth would raise, or produce an infinity."""
    assert "debt_equity" not in derive_balance_sheet({"total_debt": 50.0, "net_worth": 0})
