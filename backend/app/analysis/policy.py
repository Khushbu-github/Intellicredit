"""
Credit policy constants and the shared derivations that depend on them.

Everything the bank could change by policy lives here and nowhere else: the
gates, the limit-sizing multiples and the DSCR fallback rule. The scoring
model, the decision engine, the field-note overrides and the /meta endpoint
that feeds the UI all read from this module.

The reason for a single module is a bug this codebase actually had: the
composite cut-off was defined here as MIN_TOTAL_SCORE and re-typed as a
literal 60 in the field-note override path. Changing the policy in one place
left the other on the old threshold, so the same case could be graded against
two different cut-offs depending on which route recomputed it.
"""

# --- Policy gates -----------------------------------------------------------
MIN_TOTAL_SCORE = 60
MIN_DSCR = 1.10
COMFORT_DSCR = 1.25
MAX_LITIGATION = 3
MAX_CIRCULAR_TRADING_PCT = 20.0
MAX_PROMOTER_PLEDGE = 0.50

# --- Limit sizing parameters ------------------------------------------------
TURNOVER_MULTIPLE = 0.25      # Nayak-committee style working capital assessment
CASH_FLOW_MULTIPLE = 1.25     # CFADS discounted to the target coverage
COLLATERAL_ADVANCE_RATE = 0.70

# --- 5Cs pillar weights (sum to 100) ----------------------------------------
PILLAR_WEIGHTS = {
    "character": 25,
    "capacity": 30,
    "capital": 20,
    "collateral": 15,
    "conditions": 10,
}


def effective_dscr(data):
    """
    The DSCR the policy should be tested against.

    A figure stated in the annual report is preferred; where none was
    extracted, the ratio observed from actual bank-statement flows is used.
    The gates, the covenants, the break-even view and the Capacity pillar must
    all agree on this, so they call here rather than repeating the fallback.
    """
    stated = data.get("dscr")
    return stated if stated is not None else data.get("observed_dscr")


def dscr_with_source(data):
    """As effective_dscr, but also reports which document the figure came from."""
    if data.get("dscr") is not None:
        return data["dscr"], "annual report"
    return data.get("observed_dscr"), "bank statement flows"
