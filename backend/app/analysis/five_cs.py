"""
5Cs weighted scoring.

Every pillar returns not just a number but the components that produced it,
each with the evidence it was scored on and whether that evidence was
actually present in the case file. The UI and the CAM both render this
breakdown, so a score is never a figure the analyst has to take on trust.

Pillar weights sum to 100:
    Character 25 | Capacity 30 | Capital 20 | Collateral 15 | Conditions 10
"""

from app.analysis.policy import PILLAR_WEIGHTS, dscr_with_source  # noqa: E402

# Where a figure is missing entirely, the component scores at this fraction
# of its maximum. Absent evidence is neither rewarded nor treated as proof
# of failure, and the component is marked "assumed" in the breakdown.
_NO_EVIDENCE_FACTOR = 0.5


def _component(label, points, maximum, basis, evidenced=True):
    return {
        "label": label,
        "points": round(points, 2),
        "max": maximum,
        "basis": basis,
        "evidenced": evidenced,
    }


# ---------------------------------------------------------------------------
# Character (25) - willingness to pay
# ---------------------------------------------------------------------------

def _score_character(data):
    components = []

    cibil = data.get("cibil_score")
    if cibil is not None:
        points = min(12.0, (cibil / 900) * 12)
        components.append(_component(
            "Bureau score", points, 12,
            f"CIBIL commercial score {cibil} of 900",
        ))
    else:
        components.append(_component(
            "Bureau score", 12 * _NO_EVIDENCE_FACTOR, 12,
            "No CIBIL commercial pull on file", evidenced=False,
        ))

    dpd = data.get("cibil_dpd_30")
    if dpd is not None:
        points = max(0.0, 4 - dpd * 1.5)
        components.append(_component(
            "Repayment conduct", points, 4,
            f"{dpd} account(s) 30+ days past due" if dpd else "No 30+ DPD reported",
        ))
    else:
        components.append(_component(
            "Repayment conduct", 4 * _NO_EVIDENCE_FACTOR, 4,
            "Delinquency history not supplied", evidenced=False,
        ))

    litigation = data.get("litigation_count", 0)
    components.append(_component(
        "Litigation record", max(0.0, 4 - litigation * 2), 4,
        f"{litigation} adverse matter(s) on record" if litigation else "No litigation found",
    ))

    bounces = data.get("bounce_count", 0)
    components.append(_component(
        "Banking conduct", max(0.0, 3 - bounces * 1.5), 3,
        f"{bounces} dishonoured instrument(s)" if bounces else "No cheque returns",
    ))

    governance_penalty = 0.0
    governance_notes = []
    if data.get("related_party_flag"):
        governance_penalty += 1.0
        governance_notes.append("related-party transactions noted")
    if data.get("auditor_resigned"):
        governance_penalty += 1.0
        governance_notes.append("auditor resignation")
    if data.get("mca_red_flags", 0):
        governance_penalty += 1.0
        governance_notes.append(f"{data['mca_red_flags']} MCA flag(s)")

    components.append(_component(
        "Governance", max(0.0, 2 - governance_penalty), 2,
        "; ".join(governance_notes) if governance_notes else "No governance flags raised",
    ))

    return components


# ---------------------------------------------------------------------------
# Capacity (30) - ability to pay
# ---------------------------------------------------------------------------

def _score_capacity(data):
    components = []

    dscr, dscr_source = dscr_with_source(data)

    if dscr is not None:
        if dscr >= 1.5:
            points = 12.0
        elif dscr >= 1.25:
            points = 10.0
        elif dscr >= 1.1:
            points = 6.0
        else:
            points = 2.0
        components.append(_component(
            "Debt service coverage", points, 12,
            f"DSCR {dscr:.2f}x from {dscr_source} (floor 1.10x, comfort 1.25x)",
        ))
    else:
        components.append(_component(
            "Debt service coverage", 12 * _NO_EVIDENCE_FACTOR, 12,
            "No DSCR could be derived from the case file", evidenced=False,
        ))

    icr = data.get("interest_coverage")
    if icr is not None:
        points = 8.0 if icr >= 3 else 6.0 if icr >= 2 else 3.0 if icr >= 1.5 else 1.0
        components.append(_component(
            "Interest coverage", points, 8, f"EBITDA covers interest {icr:.2f}x",
        ))
    else:
        components.append(_component(
            "Interest coverage", 8 * _NO_EVIDENCE_FACTOR, 8,
            "Interest cost not found in the annual report", evidenced=False,
        ))

    margin = data.get("ebitda_margin")
    if margin is not None:
        points = 5.0 if margin >= 15 else 3.5 if margin >= 10 else 2.0 if margin >= 5 else 0.5
        components.append(_component(
            "Operating margin", points, 5, f"EBITDA margin {margin:.1f}% of revenue",
        ))
    else:
        components.append(_component(
            "Operating margin", 5 * _NO_EVIDENCE_FACTOR, 5,
            "Margin not derivable without both revenue and EBITDA", evidenced=False,
        ))

    utilisation = data.get("factory_capacity")
    if utilisation is not None:
        pct = utilisation * 100
        points = 5.0 if pct >= 80 else 3.0 if pct >= 60 else 1.0 if pct >= 50 else 0.0
        components.append(_component(
            "Capacity utilisation", points, 5,
            f"Site visit observed {pct:.0f}% utilisation",
        ))
    else:
        components.append(_component(
            "Capacity utilisation", 5 * _NO_EVIDENCE_FACTOR, 5,
            "No site visit recorded", evidenced=False,
        ))

    return components


# ---------------------------------------------------------------------------
# Capital (20) - skin in the game
# ---------------------------------------------------------------------------

def _score_capital(data):
    components = []

    de = data.get("debt_equity")
    if de is not None:
        points = 8.0 if de < 1.5 else 6.0 if de < 3 else 3.0 if de < 4 else 1.0
        components.append(_component(
            "Leverage", points, 8, f"Debt/equity {de:.2f}x (comfort below 3.00x)",
        ))
    else:
        components.append(_component(
            "Leverage", 8 * _NO_EVIDENCE_FACTOR, 8,
            "Debt and net worth not both found", evidenced=False,
        ))

    stake = data.get("promoter_stake")
    if stake is not None:
        pct = stake * 100
        points = 7.0 if pct >= 50 else 5.0 if pct >= 30 else 2.0
        components.append(_component(
            "Promoter holding", points, 7, f"Promoters hold {pct:.1f}% (comfort above 30%)",
        ))
    else:
        components.append(_component(
            "Promoter holding", 7 * _NO_EVIDENCE_FACTOR, 7,
            "No shareholding pattern supplied", evidenced=False,
        ))

    pledge = data.get("promoter_pledge")
    if pledge is not None:
        pct = pledge * 100
        points = 5.0 if pct == 0 else 3.5 if pct < 25 else 1.5 if pct < 50 else 0.0
        components.append(_component(
            "Promoter pledge", points, 5,
            f"{pct:.1f}% of the promoter holding is pledged" if pct else "No promoter shares pledged",
        ))
    else:
        components.append(_component(
            "Promoter pledge", 5 * _NO_EVIDENCE_FACTOR, 5,
            "Pledge position not disclosed", evidenced=False,
        ))

    return components


# ---------------------------------------------------------------------------
# Collateral (15) - fallback
# ---------------------------------------------------------------------------

def _score_collateral(data):
    components = []

    cover = data.get("security_cover")
    if cover is not None:
        points = 10.0 if cover >= 2 else 8.0 if cover >= 1.5 else 4.0 if cover >= 1.0 else 1.0
        components.append(_component(
            "Security cover", points, 10, f"Security covers exposure {cover:.2f}x (comfort 1.50x)",
        ))
    else:
        components.append(_component(
            "Security cover", 10 * _NO_EVIDENCE_FACTOR, 10,
            "No collateral valuation on file", evidenced=False,
        ))

    charges = data.get("charges_created")
    if charges is not None:
        points = 5.0 if charges == 0 else 3.5 if charges <= 3 else 2.0
        components.append(_component(
            "Charge position", points, 5,
            f"{charges} existing charge(s) registered with the MCA",
        ))
    else:
        components.append(_component(
            "Charge position", 5 * _NO_EVIDENCE_FACTOR, 5,
            "Charge register not retrieved", evidenced=False,
        ))

    return components


# ---------------------------------------------------------------------------
# Conditions (10) - the environment
# ---------------------------------------------------------------------------

_SECTOR_OUTLOOK = {
    "Manufacturing": ("Neutral", 3.5),
    "Infrastructure": ("Negative", 2.0),
    "Textiles": ("Neutral", 3.5),
    "Pharmaceuticals": ("Positive", 5.0),
    "Information Technology": ("Positive", 5.0),
    "Real Estate": ("Negative", 2.0),
    "Renewables": ("Positive", 5.0),
}


def _score_conditions(data):
    components = []

    sector = data.get("sector") or "Manufacturing"
    outlook, points = _SECTOR_OUTLOOK.get(sector, ("Neutral", 3.5))
    components.append(_component(
        "Sector outlook", points, 5, f"{sector}: {outlook.lower()} outlook",
    ))

    rating = data.get("external_rating")
    outlook_text = data.get("rating_outlook")
    if rating:
        investment_grade = data.get("investment_grade", False)
        points = 3.0 if investment_grade else 1.0
        if outlook_text == "Negative":
            points = max(0.0, points - 1.0)
        elif outlook_text == "Positive":
            points = min(3.0, points + 0.5)
        basis = f"External rating {rating}"
        if outlook_text:
            basis += f" ({outlook_text.lower()} outlook)"
        components.append(_component("External rating", points, 3, basis))
    else:
        components.append(_component(
            "External rating", 3 * _NO_EVIDENCE_FACTOR, 3,
            "No rating report supplied", evidenced=False,
        ))

    sentiment = data.get("news_sentiment", "Neutral")
    points = 2.0 if sentiment == "Positive" else 1.2 if sentiment == "Neutral" else 0.3
    components.append(_component(
        "Market sentiment", points, 2, f"{sentiment} coverage in recent news screening",
    ))

    return components


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

_PILLAR_SCORERS = {
    "character": _score_character,
    "capacity": _score_capacity,
    "capital": _score_capital,
    "collateral": _score_collateral,
    "conditions": _score_conditions,
}

_PILLAR_INTENT = {
    "character": "Willingness to repay, read from bureau conduct and governance.",
    "capacity": "Ability to service debt out of operating cash flow.",
    "capital": "Promoter commitment and the cushion absorbing losses.",
    "collateral": "Recovery position if the primary source of repayment fails.",
    "conditions": "Sector and market environment the borrower operates in.",
}


def risk_grade(total):
    """Internal grade band for the composite score."""
    if total >= 85:
        return "IC-1 (Lowest risk)"
    if total >= 75:
        return "IC-2 (Low risk)"
    if total >= 65:
        return "IC-3 (Moderate risk)"
    if total >= 60:
        return "IC-4 (Acceptable, watch)"
    if total >= 45:
        return "IC-5 (Sub-standard)"
    return "IC-6 (High risk)"


def calculate_5cs_scores(data):
    """
    Score all five pillars and return both the totals and the working.

    The `breakdown` key holds, per pillar, the components that make up its
    score - each with its own points, maximum, evidence note and a flag
    saying whether the underlying figure was actually present.
    """
    scores = {}
    breakdown = {}

    for pillar, scorer in _PILLAR_SCORERS.items():
        components = scorer(data)
        weight = PILLAR_WEIGHTS[pillar]

        raw = sum(c["points"] for c in components)
        declared_max = sum(c["max"] for c in components)
        # Components are authored to sum to the pillar weight; normalise
        # defensively so a future edit can never push a pillar over weight.
        scaled = (raw / declared_max * weight) if declared_max else 0.0
        scaled = max(0.0, min(weight, scaled))

        scores[pillar] = round(scaled, 2)
        evidenced = [c for c in components if c["evidenced"]]
        breakdown[pillar] = {
            "score": round(scaled, 2),
            "weight": weight,
            "intent": _PILLAR_INTENT[pillar],
            "components": components,
            "evidence_coverage": round(len(evidenced) / len(components) * 100, 1) if components else 0.0,
        }

    total = round(sum(scores.values()), 2)
    scores["total"] = total

    return {
        **scores,
        "breakdown": breakdown,
        "risk_grade": risk_grade(total),
        "evidence_coverage": round(
            sum(b["evidence_coverage"] for b in breakdown.values()) / len(breakdown), 1
        ),
    }
