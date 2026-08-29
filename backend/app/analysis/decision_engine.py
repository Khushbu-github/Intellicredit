"""
Decisioning, limit sizing, pricing and covenanting.

The engine is deterministic and shows its working: every gate it applies,
every constraint that sized the limit, and which one actually bound. That
working is persisted and rendered in both the UI and the memo.
"""

from app.analysis.five_cs import calculate_5cs_scores
from app.analysis.policy import (
    CASH_FLOW_MULTIPLE,
    COLLATERAL_ADVANCE_RATE,
    COMFORT_DSCR,
    MAX_CIRCULAR_TRADING_PCT,
    MAX_LITIGATION,
    MAX_PROMOTER_PLEDGE,
    MIN_DSCR,
    MIN_TOTAL_SCORE,
    TURNOVER_MULTIPLE,
    effective_dscr,
)


def _gate(code, title, breached, detail, severity="critical"):
    return {
        "code": code,
        "title": title,
        "breached": breached,
        "detail": detail,
        "severity": severity,
    }


def evaluate_gates(scores, data):
    """Run every policy gate and return the full result, breached or not."""
    total = scores.get("total", 0)
    dscr = effective_dscr(data)
    litigation = data.get("litigation_count", 0)
    circular = data.get("circular_trading_pct", 0) or 0
    pledge = data.get("promoter_pledge")

    gates = [
        _gate(
            "SCORE", "Composite score cut-off",
            total < MIN_TOTAL_SCORE,
            f"Composite {total:.1f} against a cut-off of {MIN_TOTAL_SCORE}.",
        ),
        _gate(
            "DSCR", "Debt service coverage floor",
            dscr is not None and dscr < MIN_DSCR,
            (
                f"DSCR {dscr:.2f}x against a floor of {MIN_DSCR:.2f}x."
                if dscr is not None
                else "No DSCR could be derived; the gate could not be tested."
            ),
        ),
        _gate(
            "LITIGATION", "Litigation ceiling",
            litigation >= MAX_LITIGATION,
            f"{litigation} adverse matter(s) against a ceiling of {MAX_LITIGATION}.",
        ),
        _gate(
            "GST", "Circular trading ceiling",
            circular > MAX_CIRCULAR_TRADING_PCT,
            f"Counterparty overlap {circular:.1f}% against a ceiling of {MAX_CIRCULAR_TRADING_PCT:.0f}%.",
        ),
        _gate(
            "PLEDGE", "Promoter pledge ceiling",
            pledge is not None and pledge > MAX_PROMOTER_PLEDGE,
            (
                f"{pledge * 100:.1f}% of the promoter holding is pledged, against a "
                f"ceiling of {MAX_PROMOTER_PLEDGE * 100:.0f}%."
                if pledge is not None
                else "Pledge position not disclosed; the gate could not be tested."
            ),
            severity="warning",
        ),
    ]
    return gates


def size_limit(data):
    """
    Size the facility against three independent constraints and report which bound.

    Constraints that cannot be computed for want of a figure are marked
    unavailable rather than silently defaulted, so the memo never presents
    an assumed number as an assessed one.
    """
    revenue = data.get("revenue")
    ebitda = data.get("ebitda")
    collateral = data.get("collateral_value")

    constraints = []

    if revenue:
        constraints.append({
            "basis": "Turnover method",
            "formula": f"{TURNOVER_MULTIPLE:.0%} of annual turnover",
            "input": f"Revenue Rs {revenue:,.2f} Cr",
            "value_cr": round(revenue * TURNOVER_MULTIPLE, 2),
            "available": True,
        })
    else:
        constraints.append({
            "basis": "Turnover method",
            "formula": f"{TURNOVER_MULTIPLE:.0%} of annual turnover",
            "input": "Revenue not extracted from the annual report",
            "value_cr": None,
            "available": False,
        })

    if ebitda:
        constraints.append({
            "basis": "Cash flow method",
            "formula": f"EBITDA discounted to {CASH_FLOW_MULTIPLE:.2f}x coverage",
            "input": f"EBITDA Rs {ebitda:,.2f} Cr",
            "value_cr": round(ebitda / CASH_FLOW_MULTIPLE, 2),
            "available": True,
        })
    else:
        constraints.append({
            "basis": "Cash flow method",
            "formula": f"EBITDA discounted to {CASH_FLOW_MULTIPLE:.2f}x coverage",
            "input": "EBITDA not extracted from the annual report",
            "value_cr": None,
            "available": False,
        })

    if collateral:
        constraints.append({
            "basis": "Collateral method",
            "formula": f"{COLLATERAL_ADVANCE_RATE:.0%} advance against security",
            "input": f"Security Rs {collateral:,.2f} Cr",
            "value_cr": round(collateral * COLLATERAL_ADVANCE_RATE, 2),
            "available": True,
        })
    else:
        constraints.append({
            "basis": "Collateral method",
            "formula": f"{COLLATERAL_ADVANCE_RATE:.0%} advance against security",
            "input": "No collateral valuation on file",
            "value_cr": None,
            "available": False,
        })

    computable = [c for c in constraints if c["available"]]
    if not computable:
        return {
            "recommended_limit_cr": None,
            "binding_constraint": None,
            "constraints": constraints,
            "note": (
                "No limit could be sized: none of the three methods had the "
                "figures they require."
            ),
        }

    binding = min(computable, key=lambda c: c["value_cr"])
    for c in constraints:
        c["binding"] = c is binding

    return {
        "recommended_limit_cr": binding["value_cr"],
        "binding_constraint": binding["basis"],
        "constraints": constraints,
        "note": (
            f"Sized on the {binding['basis'].lower()}, the tightest of "
            f"{len(computable)} computable constraint(s)."
        ),
    }


def price_facility(total_score, decision, security_cover=None):
    """Risk-based pricing, widened where security cover is thin."""
    if decision != "APPROVE":
        return {"spread": "Not priced", "band": "N/A", "basis": "Facility not recommended."}

    if total_score > 85:
        band, bps = "Prime", 125
    elif total_score > 80:
        band, bps = "Prime", 150
    elif total_score > 70:
        band, bps = "Standard", 225
    else:
        band, bps = "Sub-standard", 300

    adjustment = ""
    if security_cover is not None and security_cover < 1.25:
        bps += 25
        adjustment = " (+25bps for thin security cover)"

    return {
        "spread": f"Repo + {bps}bps",
        "band": band,
        "basis": f"{band} band on a composite of {total_score:.1f}{adjustment}.",
    }


def build_covenants(scores, data):
    """
    Generate the covenant package and conditions precedent that the risk
    profile calls for. Weak pillars attract tighter terms, which is what a
    credit committee would expect to see argued in the memo.
    """
    financial = [
        {
            "covenant": "Minimum DSCR",
            "threshold": f"{COMFORT_DSCR:.2f}x, tested annually on audited accounts",
            "reason": "Standard debt-service protection.",
        },
        {
            "covenant": "Maximum debt/equity",
            "threshold": "3.00x throughout the facility tenor",
            "reason": "Caps further leverage against the sanctioned base.",
        },
    ]
    conditions = [
        {
            "condition": "Execution of security documents and registration of charge with the MCA",
            "reason": "Perfects the bank's security interest before first drawdown.",
        },
    ]

    dscr = effective_dscr(data)
    if dscr is not None and dscr < COMFORT_DSCR:
        financial.append({
            "covenant": "Debt service reserve account",
            "threshold": "One quarter of debt service, funded upfront",
            "reason": f"DSCR of {dscr:.2f}x is below the {COMFORT_DSCR:.2f}x comfort level.",
        })

    if (data.get("promoter_pledge") or 0) > 0:
        financial.append({
            "covenant": "No further pledge of promoter shares",
            "threshold": "Written consent required for any incremental pledge",
            "reason": f"{(data['promoter_pledge']) * 100:.1f}% of the promoter holding is already pledged.",
        })

    if (data.get("circular_trading_pct") or 0) > 10:
        conditions.append({
            "condition": "Independent verification of the top ten trade counterparties",
            "reason": (
                f"Counterparty overlap of {data['circular_trading_pct']:.1f}% requires "
                "confirmation that trade is at arm's length."
            ),
        })

    if data.get("bounce_count", 0) > 0:
        conditions.append({
            "condition": "Twelve months of clean banking conduct before any limit enhancement",
            "reason": f"{data['bounce_count']} dishonoured instrument(s) on the statement.",
        })

    if data.get("litigation_count", 0) > 0:
        conditions.append({
            "condition": "Legal opinion on all pending NI Act §138 matters",
            "reason": f"{data['litigation_count']} adverse matter(s) on record.",
        })

    if data.get("related_party_flag"):
        conditions.append({
            "condition": "Quarterly disclosure of related-party transactions",
            "reason": "Related-party dealings were noted in the board minutes.",
        })

    if (scores.get("collateral", 0) / 15) < 0.6:
        conditions.append({
            "condition": "Fresh valuation of the offered security by a panel valuer",
            "reason": "The Collateral pillar scored below 60% of its weight.",
        })

    monitoring = [
        {"item": "Stock and book-debt statement", "frequency": "Monthly"},
        {"item": "GST return reconciliation against reported turnover", "frequency": "Quarterly"},
        {"item": "Audited financial statements", "frequency": "Annually within 180 days"},
    ]
    if data.get("bounce_count", 0) > 0 or (data.get("circular_trading_pct") or 0) > 10:
        monitoring.insert(0, {"item": "Account conduct review", "frequency": "Monthly"})

    return {
        "financial_covenants": financial,
        "conditions_precedent": conditions,
        "monitoring": monitoring,
    }


def decide_application(scores, data):
    """Apply the gates, size the limit, price it and covenant it."""
    total = scores.get("total", 0)
    gates = evaluate_gates(scores, data)
    breached = [g for g in gates if g["breached"] and g["severity"] == "critical"]
    warnings = [g for g in gates if g["breached"] and g["severity"] == "warning"]

    limit = size_limit(data)

    if breached:
        decision = "REJECT"
        reason = " | ".join(g["detail"] for g in breached)
    elif limit["recommended_limit_cr"] is None:
        decision = "REFER"
        reason = (
            "All policy gates are met, but no limit could be sized from the documents "
            "on file. Obtain the audited financials or a security valuation."
        )
    else:
        decision = "APPROVE"
        reason = f"All {len(gates)} policy gates cleared."
        if warnings:
            reason += " Approved with conditions: " + "; ".join(g["title"] for g in warnings) + "."

    pricing = price_facility(total, decision, data.get("security_cover"))
    covenants = build_covenants(scores, data)

    return {
        "decision": decision,
        "reason": reason,
        "recommended_limit_cr": limit["recommended_limit_cr"] if decision != "REJECT" else None,
        "spread": pricing["spread"],
        "pricing": pricing,
        "gates": gates,
        "limit_working": limit,
        "covenants": covenants,
    }


# ---------------------------------------------------------------------------
# Sensitivity analysis
# ---------------------------------------------------------------------------

def sensitivity(scores, data, overrides):
    """
    Re-run the decision against overridden inputs without persisting anything.

    Lets an analyst ask what would have to change for the recommendation to
    flip - the question a credit committee always asks - and get the answer
    from the same engine that produced the original decision.
    """
    merged = {**data, **{k: v for k, v in overrides.items() if v is not None}}
    new_scores = calculate_5cs_scores(merged)
    new_decision = decide_application(new_scores, merged)

    return {
        "inputs": {k: v for k, v in overrides.items() if v is not None},
        "scores": {k: v for k, v in new_scores.items() if k not in ("breakdown",)},
        "decision": new_decision["decision"],
        "reason": new_decision["reason"],
        "recommended_limit_cr": new_decision["recommended_limit_cr"],
        "spread": new_decision["spread"],
        "gates": new_decision["gates"],
        "delta": {
            "total_score": round(new_scores["total"] - scores.get("total", 0), 2),
            "decision_changed": new_decision["decision"] != data.get("_current_decision"),
        },
    }


def breakeven_analysis(scores, data):
    """
    Work out the minimum DSCR and composite score that would clear every gate,
    and how far the case currently sits from each.
    """
    total = scores.get("total", 0)
    dscr = effective_dscr(data)

    return {
        "score": {
            "required": MIN_TOTAL_SCORE,
            "current": round(total, 2),
            "gap": round(MIN_TOTAL_SCORE - total, 2),
            "cleared": total >= MIN_TOTAL_SCORE,
        },
        "dscr": {
            "required": MIN_DSCR,
            "current": round(dscr, 2) if dscr is not None else None,
            "gap": round(MIN_DSCR - dscr, 2) if dscr is not None else None,
            "cleared": dscr is not None and dscr >= MIN_DSCR,
        },
        "litigation": {
            "required": MAX_LITIGATION - 1,
            "current": data.get("litigation_count", 0),
            "gap": data.get("litigation_count", 0) - (MAX_LITIGATION - 1),
            "cleared": data.get("litigation_count", 0) < MAX_LITIGATION,
        },
    }
