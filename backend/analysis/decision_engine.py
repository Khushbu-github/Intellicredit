def decide_application(score_data, financial_data):
    """
    Recommended Limit = min(Turnover * 0.25, CFADS / 1.25, Collateral * 0.7)
    """
    total_score = score_data.get("total", 0)
    dscr = financial_data.get("dscr", 1.0)
    litigation = financial_data.get("litigation_count", 0)
    
    decision = "APPROVE"
    reason = "Meets all criteria."
    
    if total_score < 60:
        decision = "REJECT"
        reason = f"Low Risk Score: {total_score}/100"
    elif dscr < 1.1:
        decision = "REJECT"
        reason = f"Insufficient DSCR: {dscr}x (Min 1.1x required)"
    elif litigation >= 3:
        decision = "REJECT"
        reason = f"High Litigation Risk: {litigation} cases found"
        
    # Limit calculation
    revenue = financial_data.get("revenue", 10.0)
    collateral = financial_data.get("collateral_value", 5.0)
    
    # Min of 25% turnover or 70% collateral for demo
    limit = min(revenue * 0.25, collateral * 0.7)
    
    spread = "N/A"
    if decision == "APPROVE":
        if total_score > 80: spread = "Repo + 150bps"
        elif total_score > 70: spread = "Repo + 225bps"
        else: spread = "Repo + 300bps"
    
    return {
        "decision": decision,
        "reason": reason,
        "recommended_limit_cr": round(limit, 2),
        "spread": spread
    }
