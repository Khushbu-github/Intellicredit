"""
Simulated external research feeds.

These stand in for MCA, litigation-search, bureau and news APIs. Everything
returned is generated deterministically from the company name, so the same
borrower always produces the same research payload across runs - important
because the audit trail has to be reproducible - while different borrowers
produce visibly different pictures instead of one hard-coded fixture.

Every payload is tagged `"simulated": True` and carries a `source` label, so
neither the UI nor the memo can present it as verified third-party data.
"""

import hashlib
from datetime import UTC, datetime, timedelta


def _seed(company_name):
    """A stable integer derived from the borrower name."""
    digest = hashlib.sha256((company_name or "unknown").strip().lower().encode("utf-8"))
    return int(digest.hexdigest(), 16)


def _pick(seed, options, salt=0):
    return options[(seed >> (salt * 3)) % len(options)]


def _spread(seed, low, high, salt=0):
    span = high - low
    return low + ((seed >> (salt * 5)) % (span * 100)) / 100.0


_FIRST_NAMES = ["Rahul", "Amit", "Priya", "Sanjay", "Neha", "Vikram", "Anita", "Rajesh"]
_LAST_NAMES = ["Sharma", "Gupta", "Iyer", "Reddy", "Mehta", "Nair", "Chowdhury", "Patel"]


def fetch_mca_data(company_name):
    """MCA registry: directors, DIN status, registered charges."""
    seed = _seed(company_name)

    director_count = 2 + (seed % 3)
    directors = []
    for i in range(director_count):
        name = f"{_pick(seed, _FIRST_NAMES, i)} {_pick(seed, _LAST_NAMES, i + 1)}"
        din_disqualified = (seed >> (i + 7)) % 17 == 0
        directors.append({
            "name": name,
            "din": f"0{(seed >> (i * 4)) % 9999999:07d}",
            "appointed": (datetime.now(UTC) - timedelta(days=400 + (seed >> i) % 3000)).strftime("%Y-%m-%d"),
            "disqualified": din_disqualified,
        })

    charges_created = seed % 6
    din_dq = any(d["disqualified"] for d in directors)
    filing_default = (seed >> 11) % 9 == 0

    red_flags = sum([din_dq, filing_default])

    return {
        "simulated": True,
        "source": "MCA21 registry (simulated)",
        "cin": f"U{seed % 99999:05d}MH{2005 + seed % 18}PTC{seed % 999999:06d}",
        "incorporated": f"{2005 + seed % 18}-0{1 + seed % 9}-1{seed % 9}",
        "directors": directors,
        "din_dq": din_dq,
        "charges_created": charges_created,
        "active_charges_value_cr": round(_spread(seed, 2, 40, 2), 2),
        "annual_filing_default": filing_default,
        "red_flags": red_flags,
    }


def fetch_litigation_data(company_name):
    """Court and tribunal search across NI Act, recovery and insolvency matters."""
    seed = _seed(company_name)
    case_count = (seed >> 3) % 4

    jurisdictions = ["Delhi High Court", "Bombay High Court", "NCLT Mumbai", "Madras High Court"]
    natures = [
        "NI Act §138 - dishonour of cheque",
        "Summary suit for recovery",
        "Section 7 IBC application",
        "Commercial suit - supply dispute",
    ]

    cases = []
    for i in range(case_count):
        cases.append({
            "case_no": f"CS/{1000 + (seed >> (i * 3)) % 8999}/{2023 + i % 3}",
            "nature": _pick(seed, natures, i),
            "jurisdiction": _pick(seed, jurisdictions, i + 2),
            "amount_cr": round(_spread(seed, 0.2, 8, i + 1), 2),
            "status": _pick(seed, ["Pending", "Pending", "Reserved for orders"], i + 3),
        })

    return {
        "simulated": True,
        "source": "Court records search (simulated)",
        "cases_found": case_count,
        "cases": cases,
        "insolvency_reference": any("IBC" in c["nature"] for c in cases),
        "total_exposure_cr": round(sum(c["amount_cr"] for c in cases), 2),
    }


def fetch_news_sentiment(company_name):
    """Press screening for adverse media."""
    seed = _seed(company_name)
    score = (seed >> 5) % 100

    if score > 70:
        sentiment = "Positive"
    elif score > 25:
        sentiment = "Neutral"
    else:
        sentiment = "Negative"

    headlines_by_tone = {
        "Positive": [
            "Announces capacity expansion at its western plant",
            "Wins multi-year supply contract",
            "Reports improved operating margin for the year",
        ],
        "Neutral": [
            "Board approves routine reshuffle of key management",
            "Files annual return with the registrar",
            "Participates in industry trade exhibition",
        ],
        "Negative": [
            "Suppliers report delayed payments",
            "Faces scrutiny over related-party dealings",
            "Auditor flags receivable ageing",
        ],
    }

    return {
        "simulated": True,
        "source": "Press screening (simulated)",
        "sentiment": sentiment,
        "confidence": round(0.6 + (score % 35) / 100.0, 2),
        "mentions": [
            {"headline": h, "tone": sentiment, "date": (datetime.now(UTC) - timedelta(days=15 * (i + 1))).strftime("%Y-%m-%d")}
            for i, h in enumerate(headlines_by_tone[sentiment])
        ],
    }


# Sector medians used for benchmarking. Indicative figures for a demo build,
# not published statistics - labelled as such wherever they are displayed.
_SECTOR_BENCHMARKS = {
    "Manufacturing": {"dscr": 1.35, "debt_equity": 2.10, "ebitda_margin": 12.5, "promoter_stake": 0.52},
    "Textiles": {"dscr": 1.20, "debt_equity": 2.60, "ebitda_margin": 9.5, "promoter_stake": 0.58},
    "Infrastructure": {"dscr": 1.15, "debt_equity": 3.20, "ebitda_margin": 15.0, "promoter_stake": 0.45},
    "Pharmaceuticals": {"dscr": 1.80, "debt_equity": 0.90, "ebitda_margin": 21.0, "promoter_stake": 0.48},
    "Information Technology": {"dscr": 2.40, "debt_equity": 0.35, "ebitda_margin": 24.0, "promoter_stake": 0.38},
    "Real Estate": {"dscr": 1.10, "debt_equity": 3.60, "ebitda_margin": 18.0, "promoter_stake": 0.62},
    "Renewables": {"dscr": 1.45, "debt_equity": 2.80, "ebitda_margin": 28.0, "promoter_stake": 0.50},
}

SECTORS = sorted(_SECTOR_BENCHMARKS.keys())


def fetch_peer_benchmark(sector, metrics):
    """
    Compare the borrower's ratios against sector medians.

    Only metrics the case actually has are compared; the rest are reported
    as unavailable rather than benchmarked against an assumed value.
    """
    median = _SECTOR_BENCHMARKS.get(sector) or _SECTOR_BENCHMARKS["Manufacturing"]

    labels = {
        "dscr": ("Debt service coverage", "x", True),
        "debt_equity": ("Debt / equity", "x", False),
        "ebitda_margin": ("EBITDA margin", "%", True),
        "promoter_stake": ("Promoter holding", "%", True),
    }

    comparisons = []
    for key, (label, unit, higher_is_better) in labels.items():
        peer = median[key]
        actual = metrics.get(key)

        if key == "promoter_stake":
            peer_display, actual_display = peer * 100, (actual * 100 if actual is not None else None)
        else:
            peer_display, actual_display = peer, actual

        if actual is None:
            comparisons.append({
                "metric": label, "unit": unit, "peer_median": round(peer_display, 2),
                "actual": None, "available": False,
                "verdict": "Not extracted from the case file",
            })
            continue

        ahead = (actual > peer) if higher_is_better else (actual < peer)
        gap_pct = ((actual - peer) / peer * 100) if peer else 0.0

        comparisons.append({
            "metric": label,
            "unit": unit,
            "peer_median": round(peer_display, 2),
            "actual": round(actual_display, 2),
            "available": True,
            "ahead_of_peers": ahead,
            "gap_pct": round(gap_pct, 1),
            "verdict": (
                f"{'Ahead of' if ahead else 'Behind'} the {sector.lower()} median "
                f"by {abs(gap_pct):.1f}%"
            ),
        })

    return {
        "simulated": True,
        "source": f"{sector} sector medians (indicative, for demonstration)",
        "sector": sector,
        "comparisons": comparisons,
    }
