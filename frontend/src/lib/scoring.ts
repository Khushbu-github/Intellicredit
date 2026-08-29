import type { Application, PillarKey, RedFlag, Severity } from '../types/credit';

/**
 * Policy constants mirrored from the backend so the UI never invents a
 * threshold of its own. The live values are also served by GET /api/meta;
 * these are the fallbacks used before that call resolves.
 *
 * Keep in step with:
 *   backend/analysis/five_cs.py         (pillar weights)
 *   backend/analysis/decision_engine.py (gates, sizing, pricing)
 *   backend/ingest/gst_analyzer.py      (circular-trading red flag)
 */

export type Status = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export interface Pillar {
    key: PillarKey;
    label: string;
    weight: number;
    basis: string;
}

export const PILLARS: Pillar[] = [
    { key: 'character', label: 'Character', weight: 25, basis: 'Bureau conduct, litigation record, governance' },
    { key: 'capacity', label: 'Capacity', weight: 30, basis: 'DSCR, interest coverage, margin, utilisation' },
    { key: 'capital', label: 'Capital', weight: 20, basis: 'Leverage, promoter holding, pledge position' },
    { key: 'collateral', label: 'Collateral', weight: 15, basis: 'Security cover and charge position' },
    { key: 'conditions', label: 'Conditions', weight: 10, basis: 'Sector outlook, external rating, sentiment' },
];

export const POLICY = {
    minTotalScore: 60,
    minDscr: 1.1,
    strongDscr: 1.25,
    maxLitigation: 3,
    circularTradingFlag: 20,
    circularTradingWatch: 10,
    maxPromoterPledge: 50,
    turnoverMultiple: 0.25,
    cashFlowMultiple: 1.25,
    collateralAdvanceRate: 0.7,
} as const;

/** Maps the backend's severity vocabulary onto the UI status palette. */
export function severityStatus(severity: Severity): Status {
    if (severity === 'critical') return 'critical';
    if (severity === 'warning') return 'warning';
    return 'neutral';
}

/** Status for a decision string. */
export function decisionStatus(decision?: string | null): Status {
    if (decision === 'APPROVE') return 'good';
    if (decision === 'REJECT') return 'critical';
    if (decision === 'REFER') return 'warning';
    return 'neutral';
}

/** Utilisation of a pillar's available weight, clamped to 0–100. */
export function pillarPct(scored: number | null | undefined, weight: number): number {
    if (scored === null || scored === undefined) return 0;
    return Math.max(0, Math.min(100, (scored / weight) * 100));
}

/** Band label for a pillar, always rendered alongside its colour. */
export function bandOf(ratio: number): { label: string; status: Status } {
    if (ratio >= 80) return { label: 'Strong', status: 'good' };
    if (ratio >= 60) return { label: 'Adequate', status: 'neutral' };
    if (ratio >= 40) return { label: 'Marginal', status: 'warning' };
    return { label: 'Weak', status: 'critical' };
}

/** Status band for the composite score against the sanctioning cut-off. */
export function scoreStatus(total?: number | null): Status {
    if (total === null || total === undefined) return 'neutral';
    if (total < POLICY.minTotalScore) return 'critical';
    if (total < 70) return 'warning';
    return 'good';
}

export function dscrStatus(dscr?: number | null): Status {
    if (dscr === null || dscr === undefined) return 'neutral';
    if (dscr < POLICY.minDscr) return 'critical';
    if (dscr < POLICY.strongDscr) return 'warning';
    return 'good';
}

export interface RiskItem {
    id: string;
    title: string;
    detail: string;
    value: string;
    status: Status;
    verdict: string;
    threshold: string;
}

/**
 * The measured screening register.
 *
 * The backend also returns a narrative `red_flags` list; this covers the
 * quantitative checks with their thresholds, so the two are complementary
 * rather than duplicated.
 */
export function riskRegister(data: Application): RiskItem[] {
    const gst = data.gst_circular_trading_pct ?? 0;
    const mismatch = data.gst_turnover_mismatch_pct ?? null;
    const litigation = data.litigation_count ?? 0;
    const bounces = data.bounce_count ?? 0;
    const dscr = data.dscr ?? null;
    const total = data.total_score ?? null;
    const pledge = data.promoter_pledge ?? null;

    const items: RiskItem[] = [
        {
            id: 'score',
            title: 'Composite 5Cs score',
            detail: 'Weighted score across the five credit pillars',
            value: total === null ? '—' : String(Math.round(total * 10) / 10),
            threshold: `Cut-off ${POLICY.minTotalScore} / 100`,
            status: scoreStatus(total),
            verdict:
                total === null
                    ? 'Not yet scored'
                    : total < POLICY.minTotalScore
                        ? 'Breach — below the sanctioning cut-off'
                        : total < 70
                            ? 'Passes, but in the lower band'
                            : 'Comfortably above cut-off',
        },
        {
            id: 'dscr',
            title: 'Debt service coverage',
            detail: 'Cash available for debt service against scheduled obligations',
            value: dscr === null ? '—' : `${dscr.toFixed(2)}x`,
            threshold: `Floor ${POLICY.minDscr.toFixed(2)}x · comfort ${POLICY.strongDscr.toFixed(2)}x`,
            status: dscrStatus(dscr),
            verdict:
                dscr === null
                    ? 'Not detected in the uploaded documents'
                    : dscr < POLICY.minDscr
                        ? 'Breach — below the sanctioning floor'
                        : dscr < POLICY.strongDscr
                            ? 'Thin — above floor, below comfort'
                            : 'Comfortable coverage',
        },
        {
            id: 'gst',
            title: 'Circular trading exposure',
            detail: 'GSTINs appearing on both the sales and purchase registers',
            value: `${gst.toFixed(1)}%`,
            threshold: `Ceiling ${POLICY.circularTradingFlag}%`,
            status: gst > POLICY.circularTradingFlag ? 'critical' : gst > POLICY.circularTradingWatch ? 'warning' : 'good',
            verdict:
                gst > POLICY.circularTradingFlag
                    ? 'Breach — round-tripping pattern indicated'
                    : gst > POLICY.circularTradingWatch
                        ? 'Watch — overlap above comfort level'
                        : 'Within tolerance',
        },
        {
            id: 'litigation',
            title: 'Litigation matters',
            detail: 'NI Act §138 notices on file plus matters from the court search',
            value: String(litigation),
            threshold: `Reject at ${POLICY.maxLitigation} or more`,
            status: litigation >= POLICY.maxLitigation ? 'critical' : litigation > 0 ? 'warning' : 'good',
            verdict:
                litigation >= POLICY.maxLitigation
                    ? 'Breach — automatic rejection trigger'
                    : litigation > 0
                        ? 'Watch — adverse matters on record'
                        : 'No adverse record found',
        },
        {
            id: 'bounces',
            title: 'Dishonoured instruments',
            detail: 'Cheque and mandate returns in the bank statement',
            value: String(bounces),
            threshold: 'Any return is adverse conduct',
            status: bounces >= 3 ? 'critical' : bounces > 0 ? 'warning' : 'good',
            verdict:
                bounces >= 3
                    ? 'Repeated returns — serious conduct concern'
                    : bounces > 0
                        ? 'Returns on record'
                        : 'Clean banking conduct',
        },
    ];

    if (mismatch !== null) {
        items.push({
            id: 'mismatch',
            title: 'Turnover reconciliation',
            detail: 'Income declared in the ITR against turnover on the GST register',
            value: `${mismatch.toFixed(1)}%`,
            threshold: 'Investigate above 25%',
            status: mismatch > 25 ? 'critical' : mismatch > 10 ? 'warning' : 'good',
            verdict:
                mismatch > 25
                    ? 'Breach — filings do not reconcile'
                    : mismatch > 10
                        ? 'Watch — material gap between filings'
                        : 'Filings reconcile',
        });
    }

    if (pledge !== null) {
        const pct = pledge * 100;
        items.push({
            id: 'pledge',
            title: 'Promoter share pledge',
            detail: 'Share of the promoter holding pledged to lenders',
            value: `${pct.toFixed(1)}%`,
            threshold: `Ceiling ${POLICY.maxPromoterPledge}%`,
            status: pct > POLICY.maxPromoterPledge ? 'critical' : pct > 0 ? 'warning' : 'good',
            verdict:
                pct > POLICY.maxPromoterPledge
                    ? 'Breach — majority of the promoter stake is encumbered'
                    : pct > 0
                        ? 'Partial pledge on record'
                        : 'No promoter shares pledged',
        });
    }

    const rank: Record<Status, number> = { critical: 0, serious: 1, warning: 2, neutral: 3, good: 4 };
    return items.sort((a, b) => rank[a.status] - rank[b.status]);
}

export function breachCount(data: Application): number {
    const gateBreaches = (data.raw_data?.gates ?? []).filter(
        (g) => g.breached && g.severity === 'critical',
    ).length;
    if (gateBreaches > 0) return gateBreaches;
    return riskRegister(data).filter((r) => r.status === 'critical').length;
}

/** Narrative findings from the backend screening pass, worst first. */
export function sortedFlags(flags?: RedFlag[] | null): RedFlag[] {
    const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return [...(flags ?? [])].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
}
