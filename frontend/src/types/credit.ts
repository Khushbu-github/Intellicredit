/** Severity vocabulary shared by the backend red-flag register and the UI. */
export type Severity = 'critical' | 'warning' | 'info';

export interface ScoreComponent {
    label: string;
    points: number;
    max: number;
    basis: string;
    /** False when the figure was absent and the component was scored at half. */
    evidenced: boolean;
}

export interface PillarBreakdown {
    score: number;
    weight: number;
    intent: string;
    components: ScoreComponent[];
    evidence_coverage: number;
}

export type PillarKey = 'character' | 'capacity' | 'capital' | 'collateral' | 'conditions';

export interface PolicyGate {
    code: string;
    title: string;
    breached: boolean;
    detail: string;
    severity: 'critical' | 'warning';
}

export interface RedFlag {
    code: string;
    severity: Severity;
    title: string;
    detail: string;
}

export interface LimitConstraint {
    basis: string;
    formula: string;
    input: string;
    value_cr: number | null;
    available: boolean;
    binding?: boolean;
}

export interface LimitWorking {
    recommended_limit_cr: number | null;
    binding_constraint: string | null;
    constraints: LimitConstraint[];
    note: string;
}

export interface CovenantPackage {
    financial_covenants: { covenant: string; threshold: string; reason: string }[];
    conditions_precedent: { condition: string; reason: string }[];
    monitoring: { item: string; frequency: string }[];
}

export interface PeerComparison {
    metric: string;
    unit: string;
    peer_median: number;
    actual: number | null;
    available: boolean;
    ahead_of_peers?: boolean;
    gap_pct?: number;
    verdict: string;
}

export interface Research {
    mca?: {
        simulated: boolean;
        source: string;
        cin: string;
        incorporated: string;
        directors: { name: string; din: string; appointed: string; disqualified: boolean }[];
        din_dq: boolean;
        charges_created: number;
        active_charges_value_cr: number;
        annual_filing_default: boolean;
        red_flags: number;
    };
    litigation?: {
        simulated: boolean;
        source: string;
        cases_found: number;
        cases: { case_no: string; nature: string; jurisdiction: string; amount_cr: number; status: string }[];
        insolvency_reference: boolean;
        total_exposure_cr: number;
    };
    news?: {
        simulated: boolean;
        source: string;
        sentiment: 'Positive' | 'Neutral' | 'Negative';
        confidence: number;
        mentions: { headline: string; tone: string; date: string }[];
    };
    benchmark?: {
        simulated: boolean;
        source: string;
        sector: string;
        comparisons: PeerComparison[];
    };
}

export interface Application {
    id: number;
    company_name?: string | null;
    sector?: string | null;
    status: string;
    created_at?: string | null;
    analysed_at?: string | null;

    // Financials — null wherever the parser found nothing.
    revenue?: number | null;
    ebitda?: number | null;
    dscr?: number | null;
    interest_coverage?: number | null;
    debt_equity?: number | null;
    net_worth?: number | null;

    // Ownership and security
    promoter_stake?: number | null;
    promoter_pledge?: number | null;
    collateral_value?: number | null;
    security_cover?: number | null;
    existing_limits?: number | null;

    // Bureau and external
    cibil_score?: number | null;
    cibil_dpd_30?: number | null;
    cibil_enquiries?: number | null;
    external_rating?: string | null;
    rating_outlook?: string | null;

    // Scores
    character_score?: number | null;
    capacity_score?: number | null;
    capital_score?: number | null;
    collateral_score?: number | null;
    conditions_score?: number | null;
    total_score?: number | null;
    risk_grade?: string | null;

    // Screening
    gst_circular_trading_pct?: number | null;
    gst_turnover_mismatch_pct?: number | null;
    litigation_count?: number | null;
    bounce_count?: number | null;
    related_party_flag?: boolean | null;

    // Decision
    decision?: string | null;
    decision_reason?: string | null;
    recommended_limit_cr?: number | null;
    spread?: string | null;

    // Field input
    factory_capacity?: number | null;
    mgmt_quality?: number | null;
    qualitative_notes?: string | null;

    // Structured payloads
    score_breakdown?: Record<PillarKey, PillarBreakdown> | null;
    limit_working?: LimitWorking | null;
    covenants?: CovenantPackage | null;
    /** Model-drafted memo prose, present only once explicitly generated. */
    narrative?: CamNarrative | null;
    research?: Research | null;
    red_flags?: RedFlag[] | null;
    raw_data?: {
        merged_inputs?: Record<string, unknown>;
        evidence_coverage?: number;
        gates?: PolicyGate[];
        pricing?: { spread: string; band: string; basis: string };
    } | null;
}

export interface ApplicationSummary {
    id: number;
    company_name: string | null;
    sector: string | null;
    status: string;
    created_at: string | null;
    analysed_at: string | null;
    total_score: number | null;
    risk_grade: string | null;
    decision: string | null;
    recommended_limit_cr: number | null;
    document_count: number;
}

export interface CaseDocument {
    id: number;
    filename: string;
    doc_type: string;
    doc_label: string;
    size_bytes: number;
    parse_status: 'parsed' | 'stored' | 'failed';
    parse_message: string | null;
    uploaded_at: string;
    extracted: Record<string, unknown>;
}

export interface ScoreEvent {
    id: number;
    at: string;
    trigger: 'ingestion' | 'primary_notes' | 'reanalysis';
    summary: string;
    total_score: number | null;
    decision: string | null;
    delta: number | null;
    detail?: {
        gates?: PolicyGate[];
        evidence_coverage?: number;
        pillars?: Record<PillarKey, number>;
        overrides?: string[];
    } | null;
}

export interface Breakeven {
    score: { required: number; current: number; gap: number; cleared: boolean };
    dscr: { required: number; current: number | null; gap: number | null; cleared: boolean };
    litigation: { required: number; current: number; gap: number; cleared: boolean };
}

export interface SimulationInput {
    dscr?: number | null;
    revenue?: number | null;
    ebitda?: number | null;
    collateral_value?: number | null;
    promoter_stake?: number | null;
    litigation_count?: number | null;
    factory_capacity?: number | null;
    cibil_score?: number | null;
}

export interface SimulationResult {
    inputs: Record<string, number>;
    scores: Record<string, number | string>;
    decision: string;
    reason: string;
    recommended_limit_cr: number | null;
    spread: string;
    gates: PolicyGate[];
    delta: { total_score: number; decision_changed: boolean };
    baseline: {
        total_score: number | null;
        decision: string | null;
        recommended_limit_cr: number | null;
        spread: string | null;
    };
}

/** The prose sections the model drafts around the engine's computed figures. */
export interface CamNarrative {
    executive_summary: string;
    risk_commentary: string;
    mitigants: string;
    recommendation_note: string;
    generated_by: string;
}

export interface Meta {
    sectors: string[];
    pillar_weights: Record<PillarKey, number>;
    document_types: Record<string, string>;
    policy: {
        min_total_score: number;
        min_dscr: number;
        comfort_dscr: number;
        max_litigation: number;
        max_circular_trading_pct: number;
        max_promoter_pledge: number;
        turnover_multiple: number;
        cash_flow_multiple: number;
        collateral_advance_rate: number;
    };
    upload: {
        allowed_extensions: string[];
        max_bytes: number;
        max_files_per_request: number;
    };
    /** Whether this deployment has model access; drives the optional panels. */
    features: {
        llm_assist: boolean;
    };
}
