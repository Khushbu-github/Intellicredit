import React, { useState } from 'react';
import Icon from '../ui/Icon';
import { Pill, Tag } from '../ui/Status';
import { crore, EMPTY } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Research } from '../../types/credit';

type Tab = 'registry' | 'litigation' | 'press';

/**
 * External research feeds.
 *
 * Everything here is simulated in this build, and every tab says so - the
 * provenance line is not optional chrome, it is what stops simulated data
 * being read as a verified registry search.
 */
const ResearchPanel: React.FC<{ research?: Research | null }> = ({ research }) => {
    const [tab, setTab] = useState<Tab>('registry');

    if (!research) {
        return <p className="px-5 py-6 text-center text-2xs text-ink-3">No research has been run yet.</p>;
    }

    const { mca, litigation, news } = research;

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'registry', label: 'Registry', count: mca?.directors.length },
        { key: 'litigation', label: 'Litigation', count: litigation?.cases_found },
        { key: 'press', label: 'Press', count: news?.mentions.length },
    ];

    return (
        <div>
            <div className="flex gap-1 border-b border-line px-5 pt-1">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        aria-current={tab === t.key ? 'true' : undefined}
                        className={cn(
                            'relative flex items-center gap-1.5 px-3 py-2.5 text-2xs font-semibold transition-colors',
                            tab === t.key ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
                        )}
                    >
                        {t.label}
                        {t.count !== undefined && (
                            <span className="num rounded bg-surface-3 px-1.5 py-px text-[10px] text-ink-2">
                                {t.count}
                            </span>
                        )}
                        {tab === t.key && (
                            <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-t bg-[var(--accent)]" />
                        )}
                    </button>
                ))}
            </div>

            {tab === 'registry' && mca && (
                <div>
                    <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
                        {[
                            { k: 'CIN', v: mca.cin },
                            { k: 'Incorporated', v: mca.incorporated },
                            { k: 'Charges', v: String(mca.charges_created) },
                            { k: 'Charge value', v: crore(mca.active_charges_value_cr) },
                        ].map((row) => (
                            <div key={row.k} className="bg-surface px-4 py-3">
                                <dt className="eyebrow">{row.k}</dt>
                                <dd className="num mt-1 truncate text-2xs font-semibold text-ink" title={row.v}>
                                    {row.v}
                                </dd>
                            </div>
                        ))}
                    </dl>

                    <ul className="divide-y divide-line">
                        {mca.directors.map((d) => (
                            <li key={d.din} className="flex items-center justify-between gap-3 px-5 py-3">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-medium text-ink">{d.name}</p>
                                    <p className="num mt-0.5 font-mono text-2xs text-ink-3">
                                        DIN {d.din} · appointed {d.appointed}
                                    </p>
                                </div>
                                <Pill status={d.disqualified ? 'critical' : 'good'}>
                                    {d.disqualified ? 'Disqualified' : 'Active'}
                                </Pill>
                            </li>
                        ))}
                    </ul>

                    {mca.annual_filing_default && (
                        <div className="border-t border-line bg-[var(--warning-wash)] px-5 py-2.5">
                            <p className="flex items-center gap-2 text-2xs font-medium text-[var(--warning-ink)]">
                                <Icon name="alert" size={12} strokeWidth={2.2} />
                                Statutory annual filings are overdue with the registrar.
                            </p>
                        </div>
                    )}
                    <p className="border-t border-line bg-surface-2 px-5 py-2.5 text-2xs text-ink-3">
                        {mca.source}
                    </p>
                </div>
            )}

            {tab === 'litigation' && litigation && (
                <div>
                    {litigation.cases.length === 0 ? (
                        <p className="px-5 py-6 text-center text-2xs text-ink-3">
                            No matters found in the court records search.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-line">
                                        <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Case</th>
                                        <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Nature</th>
                                        <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Forum</th>
                                        <th scope="col" className="eyebrow px-3 py-2.5 text-right font-semibold">Amount</th>
                                        <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {litigation.cases.map((c) => (
                                        <tr key={c.case_no} className="border-b border-line last:border-0">
                                            <td className="num px-5 py-3 font-mono text-2xs text-ink">{c.case_no}</td>
                                            <td className="px-3 py-3 text-2xs text-ink-2">{c.nature}</td>
                                            <td className="px-3 py-3 text-2xs text-ink-3">{c.jurisdiction}</td>
                                            <td className="num px-3 py-3 text-right text-2xs font-semibold text-ink">
                                                {crore(c.amount_cr)}
                                            </td>
                                            <td className="px-5 py-3">
                                                <Tag>{c.status}</Tag>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-5 py-2.5">
                        <p className="text-2xs text-ink-3">{litigation.source}</p>
                        <p className="num text-2xs font-semibold text-ink-2">
                            Total exposure {litigation.total_exposure_cr ? crore(litigation.total_exposure_cr) : EMPTY}
                        </p>
                    </div>
                </div>
            )}

            {tab === 'press' && news && (
                <div>
                    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                        <div>
                            <p className="eyebrow">Overall tone</p>
                            <p className="mt-1 text-[13px] font-semibold text-ink">{news.sentiment}</p>
                        </div>
                        <Pill
                            status={
                                news.sentiment === 'Positive' ? 'good' : news.sentiment === 'Negative' ? 'critical' : 'neutral'
                            }
                        >
                            {(news.confidence * 100).toFixed(0)}% confidence
                        </Pill>
                    </div>
                    <ul className="divide-y divide-line">
                        {news.mentions.map((m) => (
                            <li key={m.headline} className="flex items-start justify-between gap-3 px-5 py-3">
                                <p className="text-[13px] leading-relaxed text-ink-2">{m.headline}</p>
                                <span className="num shrink-0 font-mono text-2xs text-ink-3">{m.date}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="border-t border-line bg-surface-2 px-5 py-2.5 text-2xs text-ink-3">{news.source}</p>
                </div>
            )}
        </div>
    );
};

export default ResearchPanel;
