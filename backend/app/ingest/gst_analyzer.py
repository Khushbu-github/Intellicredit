"""
GST register and bank statement screening.

Both analysers are read-only: they measure and report, and leave every
policy judgement to analysis/five_cs.py and analysis/decision_engine.py.
"""

import re

# Narration fragments that indicate a dishonoured instrument, as they appear
# on Indian bank statements.
_BOUNCE_PATTERNS = r"BOUNCE|RETURN|INSUFFICIENT|DISHONOU?R|ECS\s*RTN|NACH\s*RTN|CHQ\s*RTN"
# Narration fragments that indicate scheduled debt service.
_DEBT_SERVICE_PATTERNS = r"EMI|LOAN\s*REPAY|INTEREST|TERM\s*LOAN|INSTAL"


def _columns(df):
    df.columns = [str(c).strip() for c in df.columns]
    return {c.lower().replace(" ", "").replace("_", ""): c for c in df.columns}


def analyze_gst(df):
    """
    GST register -> circular trading, concentration and inflation signals.

    Returns measurements plus a list of red flags. Circular trading is
    measured as the share of sales counterparties that also appear as
    suppliers, which is the round-tripping pattern the RBI guidance
    describes.
    """
    cols = _columns(df)

    type_col = cols.get("type") or cols.get("transactiontype")
    gstin_col = cols.get("gstin") or cols.get("counterpartygstin")
    amount_col = cols.get("amount") or cols.get("value") or cols.get("taxablevalue")

    if not type_col or not gstin_col:
        raise KeyError(
            f"GST register needs 'Type' and 'GSTIN' columns. Seen: {list(df.columns)}"
        )

    red_flags = []

    kind = df[type_col].astype(str).str.lower().str.strip()
    sales_rows = df[kind.str.startswith("sale")]
    purchase_rows = df[kind.str.startswith("purchase")]

    sales_gstins = set(sales_rows[gstin_col].astype(str).unique())
    purchase_gstins = set(purchase_rows[gstin_col].astype(str).unique())

    overlap = sales_gstins & purchase_gstins
    circular_pct = (len(overlap) / len(sales_gstins) * 100) if sales_gstins else 0.0

    if circular_pct > 20:
        red_flags.append({
            "code": "GST_CIRCULAR",
            "severity": "critical",
            "title": "Circular trading detected",
            "detail": (
                f"{len(overlap)} of {len(sales_gstins)} sales counterparties also appear "
                f"as suppliers ({circular_pct:.1f}%), above the 20% threshold."
            ),
        })
    elif circular_pct > 10:
        red_flags.append({
            "code": "GST_CIRCULAR_WATCH",
            "severity": "warning",
            "title": "Counterparty overlap elevated",
            "detail": f"{circular_pct:.1f}% of sales counterparties also appear as suppliers.",
        })

    total_sales = float(sales_rows[amount_col].sum()) if amount_col else 0.0
    total_purchases = float(purchase_rows[amount_col].sum()) if amount_col else 0.0

    if total_purchases and total_sales > total_purchases * 1.5:
        red_flags.append({
            "code": "GST_INFLATION",
            "severity": "warning",
            "title": "Possible revenue inflation",
            "detail": (
                f"Sales of Rs {total_sales:,.0f} exceed purchases of "
                f"Rs {total_purchases:,.0f} by more than 50%."
            ),
        })

    # Counterparty concentration: a single buyer carrying most of the turnover
    # is a genuine credit risk independent of any fraud signal.
    concentration_pct = 0.0
    top_counterparty = None
    if amount_col and total_sales > 0:
        by_party = sales_rows.groupby(sales_rows[gstin_col].astype(str))[amount_col].sum()
        if len(by_party) > 0:
            top_counterparty = str(by_party.idxmax())
            concentration_pct = float(by_party.max()) / total_sales * 100

    if concentration_pct > 40:
        red_flags.append({
            "code": "GST_CONCENTRATION",
            "severity": "warning",
            "title": "Customer concentration",
            "detail": (
                f"{concentration_pct:.1f}% of turnover sits with a single counterparty "
                f"({top_counterparty})."
            ),
        })

    return {
        "circular_trading_pct": round(circular_pct, 2),
        "overlapping_gstins": sorted(overlap),
        "sales_counterparties": len(sales_gstins),
        "purchase_counterparties": len(purchase_gstins),
        "total_sales": total_sales,
        "total_purchases": total_purchases,
        "customer_concentration_pct": round(concentration_pct, 2),
        "top_counterparty": top_counterparty,
        "red_flags": red_flags,
    }


def analyze_bank_statement(df):
    """
    Bank statement -> conduct signals and cash-flow shape.

    Beyond counting dishonoured instruments, this derives the credit/debit
    turnover and the observed debt-service outflow, which the Capacity
    pillar uses when the annual report yields no DSCR of its own.
    """
    cols = _columns(df)

    desc_col = cols.get("description") or cols.get("narration") or cols.get("particulars")
    amount_col = cols.get("amount") or cols.get("value")
    type_col = cols.get("type") or cols.get("drcr") or cols.get("crdr")

    if not desc_col:
        return {
            "bounce_count": 0,
            "bounces": [],
            "red_flags": [],
            "parse_message": f"No description column found. Seen: {list(df.columns)}",
        }

    descriptions = df[desc_col].astype(str)
    red_flags = []

    bounce_mask = descriptions.str.contains(_BOUNCE_PATTERNS, case=False, na=False, regex=True)
    bounces = df[bounce_mask]
    bounce_count = int(len(bounces))

    total_txns = int(len(df))
    bounce_rate = (bounce_count / total_txns * 100) if total_txns else 0.0

    if bounce_count >= 3:
        red_flags.append({
            "code": "BANK_BOUNCE_SEVERE",
            "severity": "critical",
            "title": "Repeated cheque returns",
            "detail": f"{bounce_count} dishonoured instruments across {total_txns} transactions.",
        })
    elif bounce_count > 0:
        red_flags.append({
            "code": "BANK_BOUNCE",
            "severity": "warning",
            "title": "Cheque returns on record",
            "detail": f"{bounce_count} dishonoured instrument(s) in the statement period.",
        })

    credits = debits = debt_service = 0.0
    if amount_col:
        amounts = df[amount_col].astype(float)
        if type_col:
            direction = df[type_col].astype(str).str.upper().str.strip()
            credits = float(amounts[direction.str.startswith("CR")].sum())
            debits = float(amounts[direction.str.startswith("DR")].sum())
        else:
            credits = float(amounts[amounts > 0].sum())
            debits = float(-amounts[amounts < 0].sum())

        service_mask = descriptions.str.contains(
            _DEBT_SERVICE_PATTERNS, case=False, na=False, regex=True
        )
        debt_service = float(amounts[service_mask].sum())

    result = {
        "bounce_count": bounce_count,
        "bounce_rate_pct": round(bounce_rate, 2),
        "bounces": [
            {"description": str(row[desc_col]), "amount": float(row[amount_col]) if amount_col else None}
            for _, row in bounces.iterrows()
        ],
        "transaction_count": total_txns,
        "total_credits": credits,
        "total_debits": debits,
        "observed_debt_service": debt_service,
        "red_flags": red_flags,
    }

    # An observed coverage ratio from actual bank flows, used only when the
    # annual report gave no DSCR. Labelled distinctly so the audit trail can
    # say the figure was inferred from banking conduct rather than reported.
    if debt_service > 0 and credits > 0:
        result["observed_dscr"] = round(credits / debt_service, 2)

    return result


def validate_gstin(gstin):
    """Structural check on a GSTIN: 2-digit state, PAN, entity code, Z, checksum."""
    return bool(re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", str(gstin).strip().upper()))
