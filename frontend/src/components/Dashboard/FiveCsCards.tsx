import React, { useState } from 'react';
import Meter from '../ui/Meter';
import Icon from '../ui/Icon';
import { Pill } from '../ui/Status';
import { PILLARS, bandOf, pillarPct } from '../../lib/scoring';
import { score as fmtScore } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Application } from '../../types/credit';

/**
 * One series across five nominal pillars: bar length carries the magnitude
 * and every row is directly labelled with its own value. A pillar expands
 * to show the components that produced its score, each with the evidence
 * it was scored on - so no figure has to be taken on trust.
 */
const FiveCsCards: React.FC<{ data: Application }> = ({ data }) => {
    const [open, setOpen] = useState<string | null>(null);
    const breakdown = data.score_breakdown;

    return (
        <div>
            <ul className="divide-y divide-line">
                {PILLARS.map((pillar) => {
                    const raw = data[`${pillar.key}_score`] as number | null | undefined;
                    const ratio = pillarPct(raw, pillar.weight);
                    const band = bandOf(ratio);
                    const detail = breakdown?.[pillar.key];
                    const isOpen = open === pillar.key;
                    const assumed = detail?.components.filter((c) => !c.evidenced).length ?? 0;

                    return (
                        <li key={pillar.key}>
                            <button
                                type="button"
                                onClick={() => setOpen(isOpen ? null : pillar.key)}
                                disabled={!detail}
                                aria-expanded={isOpen}
                                className={cn(
                                    'w-full px-5 py-4 text-left transition-colors',
                                    detail ? 'hover:bg-surface-2' : 'cursor-default',
                                )}
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <div className="flex min-w-0 items-baseline gap-2">
                                        {detail && (
                                            <Icon
                                                name="chevronRight"
                                                size={13}
                                                className={cn(
                                                    'shrink-0 self-center text-ink-3 transition-transform',
                                                    isOpen && 'rotate-90',
                                                )}
                                            />
                                        )}
                                        <span className="text-[13px] font-semibold text-ink">{pillar.label}</span>
                                        <span className="num shrink-0 text-2xs text-ink-3">{pillar.weight}% weight</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2.5">
                                        <span className="num text-[13px] font-semibold text-ink">
                                            {fmtScore(raw)}
                                            <span className="font-normal text-ink-3"> / {pillar.weight}</span>
                                        </span>
                                        <Pill status={band.status}>{band.label}</Pill>
                                    </div>
                                </div>

                                <Meter value={ratio} status={band.status} className="mt-2.5" />

                                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs leading-relaxed text-ink-3">
                                    <span>{detail?.intent ?? pillar.basis}</span>
                                    {assumed > 0 && (
                                        <span className="text-[var(--warning-ink)]">
                                            · {assumed} component{assumed === 1 ? '' : 's'} assumed for want of evidence
                                        </span>
                                    )}
                                </p>
                            </button>

                            {isOpen && detail && (
                                <div className="animate-fade-in border-t border-line bg-surface-2 px-5 py-3">
                                    <table className="w-full border-collapse text-left">
                                        <thead>
                                            <tr>
                                                <th scope="col" className="eyebrow pb-2 font-semibold">Component</th>
                                                <th scope="col" className="eyebrow pb-2 text-right font-semibold">Points</th>
                                                <th scope="col" className="eyebrow pb-2 pl-4 font-semibold">Evidence</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.components.map((c) => (
                                                <tr key={c.label} className="border-t border-line align-top">
                                                    <td className="py-2 pr-3 text-2xs font-medium text-ink">{c.label}</td>
                                                    <td className="num whitespace-nowrap py-2 text-right text-2xs font-semibold text-ink">
                                                        {c.points.toFixed(1)}
                                                        <span className="font-normal text-ink-3"> / {c.max}</span>
                                                    </td>
                                                    <td className="py-2 pl-4 text-2xs leading-relaxed text-ink-2">
                                                        {c.basis}
                                                        {!c.evidenced && (
                                                            <span className="ml-1.5 inline-flex items-center gap-1 text-[var(--warning-ink)]">
                                                                <Icon name="alert" size={10} strokeWidth={2.4} />
                                                                assumed
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <p className="mt-2.5 text-2xs text-ink-3">
                                        Evidence coverage{' '}
                                        <span className="num font-semibold text-ink-2">
                                            {detail.evidence_coverage.toFixed(0)}%
                                        </span>{' '}
                                        — components without a supporting figure score at half their maximum.
                                    </p>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="border-t border-line bg-surface-2 px-5 py-3">
                <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-semibold text-ink">Composite score</span>
                    <span className="num text-[13px] font-semibold text-ink">
                        {fmtScore(data.total_score)}
                        <span className="font-normal text-ink-3"> / 100</span>
                    </span>
                </div>
                {data.risk_grade && (
                    <p className="mt-1 text-2xs text-ink-3">Internal grade {data.risk_grade}</p>
                )}
            </div>
        </div>
    );
};

export default FiveCsCards;
