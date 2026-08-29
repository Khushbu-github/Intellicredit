import React, { useState } from 'react';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import { Pill, Tag } from '../ui/Status';
import { caseRef, crore, dateOf, score as fmtScore, EMPTY } from '../../lib/format';
import { decisionStatus, scoreStatus } from '../../lib/scoring';
import type { ApplicationSummary } from '../../types/credit';

interface PortfolioProps {
    cases: ApplicationSummary[];
    loading: boolean;
    onOpen: (appId: number, companyName: string, sector: string) => void;
    onDelete: (appId: number) => Promise<void>;
    onNewCase: () => void;
    onRefresh: () => void;
}

const parseDate = (value: string | null) => {
    if (!value) return null;
    const d = new Date(value.endsWith('Z') ? value : `${value}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The case portfolio. Cases persisted server-side are now reachable again -
 * previously a refresh lost the case and there was no way back to it.
 */
const Portfolio: React.FC<PortfolioProps> = ({
    cases, loading, onOpen, onDelete, onNewCase, onRefresh,
}) => {
    const [confirming, setConfirming] = useState<number | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const handleDelete = async (appId: number) => {
        setBusyId(appId);
        try {
            await onDelete(appId);
        } finally {
            setBusyId(null);
            setConfirming(null);
        }
    };

    const analysed = cases.filter((c) => c.status === 'Analyzed');
    const approved = analysed.filter((c) => c.decision === 'APPROVE');
    const exposure = approved.reduce((sum, c) => sum + (c.recommended_limit_cr ?? 0), 0);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow">Portfolio</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Appraisal cases</h1>
                    <p className="mt-1 text-[13px] text-ink-2">
                        Every case on file. Open one to continue, or start a new appraisal.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" icon="refresh" onClick={onRefresh} disabled={loading}>
                        Refresh
                    </Button>
                    <Button variant="primary" icon="plus" onClick={onNewCase}>
                        New case
                    </Button>
                </div>
            </div>

            {/* Portfolio summary */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: 'Cases on file', value: String(cases.length), caption: 'Across all statuses' },
                    { label: 'Analysed', value: String(analysed.length), caption: 'Scored and decisioned' },
                    { label: 'Recommended', value: String(approved.length), caption: 'Cleared every policy gate' },
                    {
                        label: 'Recommended exposure',
                        value: approved.length ? crore(exposure) : EMPTY,
                        caption: 'Sum of recommended limits',
                    },
                ].map((tile) => (
                    <div key={tile.label} className="panel p-4">
                        <p className="eyebrow">{tile.label}</p>
                        <p className="figure mt-2 text-[24px] leading-none">{tile.value}</p>
                        <p className="mt-2 text-2xs text-ink-3">{tile.caption}</p>
                    </div>
                ))}
            </div>

            <Panel title="All cases" subtitle={`${cases.length} on file`} flush>
                {loading ? (
                    <div className="space-y-3 p-5">
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} className="h-14 w-full" />
                        ))}
                    </div>
                ) : cases.length === 0 ? (
                    <EmptyState
                        icon="building"
                        title="No cases yet"
                        description="Register a borrowing entity to open the first appraisal."
                        action={
                            <Button variant="primary" icon="plus" onClick={onNewCase}>
                                New case
                            </Button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px] border-collapse text-left">
                            <thead>
                                <tr className="border-b border-line">
                                    <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Case</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Sector</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 text-right font-semibold">Score</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Grade</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Decision</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 text-right font-semibold">Limit</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Opened</th>
                                    <th scope="col" className="eyebrow px-5 py-2.5 text-right font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cases.map((c) => {
                                    const opened = parseDate(c.created_at);
                                    const isConfirming = confirming === c.id;
                                    return (
                                        <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                                            <td className="px-5 py-3">
                                                <button
                                                    type="button"
                                                    onClick={() => onOpen(c.id, c.company_name ?? 'Unnamed', c.sector ?? 'Manufacturing')}
                                                    className="text-left"
                                                >
                                                    <span className="text-[13px] font-semibold text-ink hover:text-[var(--accent-ink)]">
                                                        {c.company_name ?? 'Unnamed borrower'}
                                                    </span>
                                                    <span className="num mt-0.5 block font-mono text-2xs text-ink-3">
                                                        {caseRef(c.id)} · {c.document_count} doc{c.document_count === 1 ? '' : 's'}
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="px-3 py-3 text-2xs text-ink-2">{c.sector ?? EMPTY}</td>
                                            <td className="num px-3 py-3 text-right text-[13px] font-semibold text-ink">
                                                {fmtScore(c.total_score)}
                                            </td>
                                            <td className="px-3 py-3">
                                                {c.risk_grade ? (
                                                    <Pill status={scoreStatus(c.total_score)} icon={null}>
                                                        {c.risk_grade.split(' ')[0]}
                                                    </Pill>
                                                ) : (
                                                    <span className="text-2xs text-ink-3">{EMPTY}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3">
                                                {c.decision ? (
                                                    <Pill status={decisionStatus(c.decision)}>{c.decision}</Pill>
                                                ) : (
                                                    <Tag>Pending</Tag>
                                                )}
                                            </td>
                                            <td className="num px-3 py-3 text-right text-[13px] text-ink">
                                                {c.recommended_limit_cr != null ? crore(c.recommended_limit_cr) : EMPTY}
                                            </td>
                                            <td className="px-3 py-3 text-2xs text-ink-3">
                                                {opened ? dateOf(opened) : EMPTY}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {isConfirming ? (
                                                        <>
                                                            <span className="text-2xs text-ink-2">Delete?</span>
                                                            <Button
                                                                variant="danger"
                                                                size="sm"
                                                                loading={busyId === c.id}
                                                                onClick={() => handleDelete(c.id)}
                                                            >
                                                                Confirm
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                                                                Cancel
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                iconRight="arrowRight"
                                                                onClick={() => onOpen(c.id, c.company_name ?? 'Unnamed', c.sector ?? 'Manufacturing')}
                                                            >
                                                                Open
                                                            </Button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirming(c.id)}
                                                                aria-label={`Delete ${c.company_name ?? 'case'}`}
                                                                className="rounded p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-[var(--critical-ink)]"
                                                            >
                                                                <Icon name="trash" size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
        </div>
    );
};

export default Portfolio;
