import React from 'react';
import Panel from '../ui/Panel';
import StatTile from '../ui/StatTile';
import Button from '../ui/Button';
import { Tag } from '../ui/Status';
import DecisionBanner from './DecisionBanner';
import FiveCsCards from './FiveCsCards';
import RiskFlags from './RiskFlags';
import FlagRegister from './FlagRegister';
import LimitWorking from './LimitWorking';
import PeerBenchmark from './PeerBenchmark';
import ResearchPanel from './ResearchPanel';
import { POLICY, dscrStatus, scoreStatus } from '../../lib/scoring';
import { crore, pct, score as fmtScore, times, EMPTY } from '../../lib/format';
import type { Application } from '../../types/credit';

interface DashboardProps {
    data: Application;
    documentCount: number;
    onReanalyze: () => void;
    reanalyzing: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ data, documentCount, onReanalyze, reanalyzing }) => {
    const total = data.total_score ?? null;
    const dscr = data.dscr ?? null;
    const revenue = data.revenue ?? null;
    const ebitda = data.ebitda ?? null;
    const margin = revenue && ebitda && revenue > 0 ? (ebitda / revenue) * 100 : null;
    const coverage = data.raw_data?.evidence_coverage ?? null;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow">Step 3 · Assessment</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Credit assessment</h1>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                        Derived from{' '}
                        {documentCount > 0
                            ? `${documentCount} ingested document${documentCount === 1 ? '' : 's'}`
                            : 'the case file'}{' '}
                        and the registry, litigation and press screening feeds.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {coverage !== null && <Tag>Evidence coverage {coverage.toFixed(0)}%</Tag>}
                    <Button variant="secondary" icon="refresh" loading={reanalyzing} onClick={onReanalyze}>
                        Re-analyse
                    </Button>
                </div>
            </div>

            <DecisionBanner data={data} />

            {/* Headline figures */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Composite 5Cs score"
                    value={fmtScore(total)}
                    unit="/ 100"
                    status={scoreStatus(total)}
                    statusLabel={
                        total === null
                            ? 'Unscored'
                            : total < POLICY.minTotalScore
                                ? 'Below cut-off'
                                : total < 70
                                    ? 'Lower band'
                                    : 'Above cut-off'
                    }
                    meter={{
                        value: total ?? 0,
                        threshold: POLICY.minTotalScore,
                        thresholdLabel: `Cut-off ${POLICY.minTotalScore}`,
                    }}
                    caption={data.risk_grade ?? `Tick marks the ${POLICY.minTotalScore}-point cut-off.`}
                />

                <StatTile
                    label="Debt service coverage"
                    value={dscr === null ? EMPTY : times(dscr)}
                    status={dscrStatus(dscr)}
                    statusLabel={
                        dscr === null
                            ? 'Not detected'
                            : dscr < POLICY.minDscr
                                ? 'Below floor'
                                : dscr < POLICY.strongDscr
                                    ? 'Thin'
                                    : 'Comfortable'
                    }
                    meter={{
                        value: dscr === null ? 0 : Math.min(100, (dscr / 2) * 100),
                        threshold: (POLICY.minDscr / 2) * 100,
                        thresholdLabel: `Floor ${POLICY.minDscr}x`,
                    }}
                    caption={`Scale 0–2.00x. Tick marks the ${POLICY.minDscr.toFixed(2)}x floor.`}
                />

                <StatTile
                    label="Annual revenue"
                    value={revenue === null ? EMPTY : crore(revenue)}
                    caption={
                        margin === null
                            ? 'Parsed from the audited annual report.'
                            : `EBITDA ${crore(ebitda)} at a ${pct(margin)} margin.`
                    }
                />

                <StatTile
                    label="Promoter holding"
                    value={data.promoter_stake == null ? EMPTY : pct(data.promoter_stake * 100)}
                    status={
                        data.promoter_pledge == null
                            ? 'neutral'
                            : data.promoter_pledge * 100 > POLICY.maxPromoterPledge
                                ? 'critical'
                                : data.promoter_pledge > 0
                                    ? 'warning'
                                    : 'good'
                    }
                    statusLabel={
                        data.promoter_pledge == null
                            ? undefined
                            : data.promoter_pledge > 0
                                ? `${pct(data.promoter_pledge * 100, 0)} pledged`
                                : 'Unencumbered'
                    }
                    caption={
                        data.promoter_stake == null
                            ? 'No shareholding pattern on file.'
                            : `Pledge ceiling ${POLICY.maxPromoterPledge}% of the promoter stake.`
                    }
                />
            </div>

            {/* Scoring and measured risk */}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <Panel title="5Cs breakdown" subtitle="Select a pillar to see its working" flush>
                    <FiveCsCards data={data} />
                </Panel>

                <Panel title="Risk register" subtitle="Measured checks against policy, worst first" flush>
                    <RiskFlags data={data} />
                </Panel>
            </div>

            {/* Screening findings and limit working */}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <Panel
                    title="Screening exceptions"
                    subtitle={`${(data.red_flags ?? []).length} finding${(data.red_flags ?? []).length === 1 ? '' : 's'}`}
                    flush
                >
                    <FlagRegister flags={data.red_flags} />
                </Panel>

                <Panel title="Peer comparison" subtitle={`${data.sector ?? 'Sector'} medians`} flush>
                    <PeerBenchmark research={data.research} />
                </Panel>
            </div>

            <Panel
                title="Limit assessment"
                subtitle="Three methods; the tightest binds"
                flush
            >
                <LimitWorking data={data} />
            </Panel>

            <Panel title="External research" subtitle="Registry, courts and press" flush>
                <ResearchPanel research={data.research} />
            </Panel>

            {/* Financial detail */}
            <Panel title="Financial summary" subtitle="As extracted from the case documents" flush>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-line">
                                <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Measure</th>
                                <th scope="col" className="eyebrow px-5 py-2.5 text-right font-semibold">Value</th>
                                <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Source</th>
                                <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { k: 'Revenue (annual)', v: revenue === null ? EMPTY : crore(revenue), src: 'Annual report', note: revenue === null ? 'Not detected by the parser' : 'Regex extraction with OCR fallback' },
                                { k: 'EBITDA', v: ebitda === null ? EMPTY : crore(ebitda), src: 'Annual report', note: margin === null ? 'Margin not derivable' : `${pct(margin)} margin` },
                                { k: 'DSCR', v: dscr === null ? EMPTY : times(dscr), src: 'Annual report / bank flows', note: `Floor ${POLICY.minDscr.toFixed(2)}x · comfort ${POLICY.strongDscr.toFixed(2)}x` },
                                { k: 'Interest coverage', v: data.interest_coverage == null ? EMPTY : times(data.interest_coverage), src: 'Annual report', note: 'EBITDA against interest cost' },
                                { k: 'Debt / equity', v: data.debt_equity == null ? EMPTY : times(data.debt_equity), src: 'Annual report', note: 'Comfort below 3.00x' },
                                { k: 'Net worth', v: data.net_worth == null ? EMPTY : crore(data.net_worth), src: 'Annual report', note: 'Shareholders’ funds' },
                                { k: 'Promoter holding', v: data.promoter_stake == null ? EMPTY : pct(data.promoter_stake * 100), src: 'Shareholding pattern', note: 'Comfort above 30%' },
                                { k: 'Promoter pledge', v: data.promoter_pledge == null ? EMPTY : pct(data.promoter_pledge * 100), src: 'Shareholding pattern', note: `Ceiling ${POLICY.maxPromoterPledge}%` },
                                { k: 'Security cover', v: data.security_cover == null ? EMPTY : times(data.security_cover), src: 'Sanction letter', note: 'Security against existing exposure' },
                                { k: 'Existing limits', v: data.existing_limits == null ? EMPTY : crore(data.existing_limits), src: 'Sanction letter', note: 'Sanctioned exposure elsewhere' },
                                { k: 'CIBIL commercial', v: data.cibil_score == null ? EMPTY : String(data.cibil_score), src: 'Bureau pull', note: data.cibil_dpd_30 == null ? 'Out of 900' : `${data.cibil_dpd_30} account(s) 30+ DPD` },
                                { k: 'External rating', v: data.external_rating ?? EMPTY, src: 'Rating report', note: data.rating_outlook ? `${data.rating_outlook} outlook` : 'No outlook stated' },
                                { k: 'Circular trading overlap', v: pct(data.gst_circular_trading_pct ?? 0), src: 'GST returns', note: `Ceiling ${POLICY.circularTradingFlag}%` },
                                { k: 'Turnover reconciliation', v: data.gst_turnover_mismatch_pct == null ? EMPTY : pct(data.gst_turnover_mismatch_pct), src: 'ITR vs GST', note: 'Investigate above 25%' },
                                { k: 'Litigation matters', v: String(data.litigation_count ?? 0), src: 'Legal notices · court search', note: `Reject at ${POLICY.maxLitigation}` },
                                { k: 'Dishonoured instruments', v: String(data.bounce_count ?? 0), src: 'Bank statement', note: 'Any return is adverse conduct' },
                            ].map((row) => (
                                <tr key={row.k} className="border-b border-line last:border-0">
                                    <td className="px-5 py-3 text-[13px] font-medium text-ink">{row.k}</td>
                                    <td className="num px-5 py-3 text-right text-[13px] font-semibold text-ink">{row.v}</td>
                                    <td className="px-5 py-3 text-2xs text-ink-2">{row.src}</td>
                                    <td className="px-5 py-3 text-2xs text-ink-3">{row.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="border-t border-line bg-surface-2 px-5 py-2.5 text-2xs text-ink-3">
                    A dash means the figure was not present in the documents on file. Scoring components
                    without a supporting figure are marked as assumed in the 5Cs breakdown.
                </p>
            </Panel>
        </div>
    );
};

export default Dashboard;
