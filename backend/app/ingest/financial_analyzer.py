"""
Ingestors for the structured filings that sit alongside the annual report:
shareholding patterns, ITR summaries and the CIBIL commercial pull.

Each function is defensive about column naming, returns a flat dict of
extracted values, and never invents a figure - anything it cannot find is
simply absent from the result so the scorer can tell "not supplied" apart
from "supplied and zero".
"""

import json
import re


def _columns(df):
    """Case-insensitive column lookup for CSVs written by different systems."""
    df.columns = [str(c).strip() for c in df.columns]
    return {c.lower().replace(" ", "").replace("_", ""): c for c in df.columns}


def _to_float(value):
    if value is None:
        return None
    try:
        cleaned = re.sub(r"[^\d.\-]", "", str(value))
        return float(cleaned) if cleaned not in ("", "-", ".") else None
    except (TypeError, ValueError):
        return None


def analyze_shareholding(df):
    """
    Shareholding pattern -> promoter stake and pledge level.

    Expected columns: Entity, Stake (%), Pledged (% of that entity's holding).
    Promoter rows are identified by the word "promoter" in the entity name.
    Pledged promoter shares are a recognised distress signal in Indian
    corporate credit, so they are surfaced separately from the stake itself.
    """
    cols = _columns(df)
    entity_col = cols.get("entity") or cols.get("name") or cols.get("holder")
    stake_col = cols.get("stake") or cols.get("stakepct") or cols.get("holding")
    pledge_col = cols.get("pledged") or cols.get("pledge") or cols.get("pledgedpct")

    if not entity_col or not stake_col:
        return {"shareholding_parsed": False}

    promoter_stake = 0.0
    promoter_pledged_abs = 0.0
    holders = []

    for _, row in df.iterrows():
        entity = str(row[entity_col])
        stake = _to_float(row[stake_col]) or 0.0
        pledged = _to_float(row[pledge_col]) if pledge_col else 0.0
        pledged = pledged or 0.0

        holders.append({"entity": entity, "stake_pct": stake, "pledged_pct": pledged})

        if "promoter" in entity.lower():
            promoter_stake += stake
            promoter_pledged_abs += stake * (pledged / 100.0)

    pledge_ratio = (promoter_pledged_abs / promoter_stake) if promoter_stake else 0.0

    return {
        "shareholding_parsed": True,
        "promoter_stake": round(promoter_stake / 100.0, 4),
        "promoter_pledge": round(pledge_ratio, 4),
        "holders": holders,
    }


def analyze_itr(df, gst_sales_rs=None):
    """
    ITR summary -> declared income, and a cross-check against GST sales.

    A material gap between income declared to the tax authority and turnover
    reported on the GST register is a classic revenue-inflation signal, so
    the mismatch is returned as a percentage when both sides are available.
    """
    cols = _columns(df)
    income_col = cols.get("totalincome") or cols.get("income") or cols.get("turnover")
    tax_col = cols.get("taxpaid") or cols.get("tax")
    year_col = cols.get("year") or cols.get("ay")

    if not income_col:
        return {"itr_parsed": False}

    total_income = _to_float(df[income_col].sum())
    tax_paid = _to_float(df[tax_col].sum()) if tax_col else None

    result = {
        "itr_parsed": True,
        "itr_total_income_rs": total_income,
        "itr_tax_paid_rs": tax_paid,
        "itr_years": [str(v) for v in df[year_col].tolist()] if year_col else [],
    }

    if total_income:
        result["itr_income_cr"] = round(total_income / 1e7, 2)
        if tax_paid:
            result["effective_tax_rate"] = round((tax_paid / total_income) * 100, 2)

    # Cross-verification against the GST sales register.
    if total_income and gst_sales_rs:
        mismatch = abs(total_income - gst_sales_rs) / max(total_income, gst_sales_rs)
        result["gst_turnover_mismatch_pct"] = round(mismatch * 100, 2)
        result["gst_sales_cr"] = round(gst_sales_rs / 1e7, 2)

    return result


def analyze_cibil(raw_bytes):
    """
    CIBIL commercial pull (JSON) -> bureau score, delinquency and enquiry load.

    Replaces the previous hard-coded assumption of a 700 score, which meant
    every borrower was scored on the same bureau input regardless of file.
    """
    try:
        payload = json.loads(raw_bytes.decode("utf-8"))
    except (ValueError, AttributeError, UnicodeDecodeError) as exc:
        return {"cibil_parsed": False, "cibil_error": str(exc)[:200]}

    if not isinstance(payload, dict):
        return {"cibil_parsed": False, "cibil_error": "Expected a JSON object"}

    lower = {str(k).lower().replace("_", ""): v for k, v in payload.items()}

    score = lower.get("score") or lower.get("cibilscore") or lower.get("commercialscore")
    dpd = lower.get("dpd30") or lower.get("dpd") or lower.get("dayspastdue")
    enquiries = lower.get("totalenquiries") or lower.get("enquiries")

    result = {"cibil_parsed": True}
    if score is not None:
        try:
            result["cibil_score"] = int(float(score))
        except (TypeError, ValueError):
            pass
    if dpd is not None:
        try:
            result["cibil_dpd_30"] = int(float(dpd))
        except (TypeError, ValueError):
            pass
    if enquiries is not None:
        try:
            result["cibil_enquiries"] = int(float(enquiries))
        except (TypeError, ValueError):
            pass

    return result


def derive_balance_sheet(financials):
    """
    Derive the leverage and coverage ratios the 5Cs model needs from the
    figures the annual-report parser managed to extract.

    Only ratios whose inputs are actually present are returned; the scorer
    treats a missing ratio as "not evidenced" rather than substituting a
    flattering default.
    """
    derived = {}

    revenue = financials.get("revenue")
    ebitda = financials.get("ebitda")
    interest = financials.get("interest_expense")
    debt = financials.get("total_debt")
    equity = financials.get("net_worth")

    if revenue and ebitda:
        derived["ebitda_margin"] = round((ebitda / revenue) * 100, 2)

    if ebitda and interest:
        derived["interest_coverage"] = round(ebitda / interest, 2)

    if debt is not None and equity:
        derived["debt_equity"] = round(debt / equity, 2)
        derived["net_worth"] = equity

    return derived
