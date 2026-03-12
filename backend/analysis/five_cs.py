def calculate_5cs_scores(data):
    """
    data: dict containing financials, gst analysis, research findings
    """
    # 1. Character (25%): CIBIL score + MCA DIN DQ + Litigation count
    character_score = 0
    cibil = data.get("cibil_score", 700)
    character_score += (cibil / 900) * 60 # Max 60 from CIBIL
    
    mca_flags = data.get("mca_red_flags", 0)
    character_score += max(0, 20 - (mca_flags * 10))
    
    litigation = data.get("litigation_count", 0)
    character_score += max(0, 20 - (litigation * 10))
    
    # 2. Capacity (30%): DSCR>1.25x + Interest Coverage>2x + GST flows
    capacity_score = 0
    dscr = data.get("dscr", 1.0)
    if dscr >= 1.25: capacity_score += 15
    elif dscr >= 1.1: capacity_score += 10
    else: capacity_score += 5
    
    interest_coverage = data.get("interest_coverage", 2.0)
    if interest_coverage >= 2.0: capacity_score += 10
    else: capacity_score += 5
    
    gst_growth = data.get("gst_growth", 0.1) # 10%
    if gst_growth > 0: capacity_score += 5
    
    # Primary Note Adjustment
    factory_capacity = data.get("primary_notes", {}).get("factory_capacity", 1.0)
    if factory_capacity < 0.5: capacity_score -= 15 # Reject/Penalty
    
    # 3. Capital (20%): Debt/Equity<3x + Promoter stake>30%
    capital_score = 0
    de_ratio = data.get("debt_equity", 2.0)
    if de_ratio < 3: capital_score += 12
    else: capital_score += 6
    
    promoter_stake = data.get("promoter_stake", 0.4)
    if promoter_stake > 0.3: capital_score += 8
    else: capital_score += 4
    
    # 4. Collateral (15%): Security cover>1.5x + Asset vintage
    collateral_score = 0
    security_cover = data.get("security_cover", 1.2)
    if security_cover >= 1.5: collateral_score += 10
    else: collateral_score += 5
    
    asset_quality = data.get("asset_quality", 3) # 1-5 scale
    collateral_score += (asset_quality / 5) * 5
    
    # 5. Conditions (10%): Sector outlook + RBI regulations
    conditions_score = 0
    sector_outlook = data.get("sector_outlook", "Neutral")
    if sector_outlook == "Positive": conditions_score += 10
    elif sector_outlook == "Neutral": conditions_score += 7
    else: conditions_score += 3
    
    total_score = character_score + capacity_score + capital_score + collateral_score + conditions_score
    
    return {
        "character": round(character_score, 2),
        "capacity": round(capacity_score, 2),
        "capital": round(capital_score, 2),
        "collateral": round(collateral_score, 2),
        "conditions": round(conditions_score, 2),
        "total": round(total_score, 2)
    }
