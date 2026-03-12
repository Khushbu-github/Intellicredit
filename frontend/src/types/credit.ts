export interface Application {
    id: number;
    company_name?: string;
    status: string;
    revenue?: number;
    ebitda?: number;
    dscr?: number;
    character_score?: number;
    capacity_score?: number;
    capital_score?: number;
    collateral_score?: number;
    conditions_score?: number;
    total_score?: number;
    gst_circular_trading_pct?: number;
    litigation_count: number;
    decision?: string;
    decision_reason?: string;
    recommended_limit_cr?: number;
    spread?: string;
}

export interface ScoreData {
    character: number;
    capacity: number;
    capital: number;
    collateral: number;
    conditions: number;
    total: number;
}
