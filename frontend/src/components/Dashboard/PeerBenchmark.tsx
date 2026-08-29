import React from 'react';
import Icon from '../ui/Icon';
import { EMPTY } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Research } from '../../types/credit';

/**
 * Borrower ratios against sector medians.
 *
 * Each row is a paired comparison on its own scale, drawn as two marks on a
 * shared track rather than as a chart with two y-axes. Metrics the case
 * does not have are reported as unavailable rather than benchmarked
 * against an assumed value.
 */
const PeerBenchmark: React.FC<{ research?: Research | null }> = ({ research }) => {
    const benchmark = research?.benchmark;

    if (!benchmark || benchmark.comparisons.length === 0) {
        return <p className="px-5 py-6 text-center text-2xs text-ink-3">No peer comparison available.</p>;
    }

    return (
        <div>
            <ul className="divide-y divide-line">
                {benchmark.comparisons.map((c) => {
                    // Both marks are placed on a common track scaled to the larger
                    // of the two values, so the comparison stays on one axis.
                    const ceiling = Math.max(c.actual ?? 0, c.peer_median) * 1.15 || 1;
                    const actualPct = ((c.actual ?? 0) / ceiling) * 100;
                    const peerPct = (c.peer_median / ceiling) * 100;

                    return (
                        <li key={c.metric} className="px-5 py-3.5">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-[13px] font-medium text-ink">{c.metric}</span>
                                <div className="num flex shrink-0 items-baseline gap-3 text-2xs">
                                    <span className="text-ink-3">
                                        Peer {c.peer_median}
                                        {c.unit}
                                    </span>
                                    <span className="text-[13px] font-semibold text-ink">
                                        {c.available ? `${c.actual}${c.unit}` : EMPTY}
                                    </span>
                                </div>
                            </div>

                            {c.available ? (
                                <>
                                    <div className="relative mt-2.5 h-1.5 w-full rounded-full bg-surface-3">
                                        <div
                                            className="h-full rounded-full transition-[width] duration-700"
                                            style={{
                                                width: `${Math.min(100, actualPct)}%`,
                                                backgroundColor: c.ahead_of_peers
                                                    ? 'var(--status-good)'
                                                    : 'var(--status-warning)',
                                            }}
                                        />
                                        <span
                                            title={`Sector median ${c.peer_median}${c.unit}`}
                                            className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 bg-[var(--ink-3)]"
                                            style={{ left: `calc(${Math.min(100, peerPct)}% - 1px)` }}
                                        />
                                    </div>
                                    <p
                                        className={cn(
                                            'mt-1.5 flex items-center gap-1.5 text-2xs',
                                            c.ahead_of_peers ? 'text-[var(--good-ink)]' : 'text-[var(--warning-ink)]',
                                        )}
                                    >
                                        <Icon
                                            name={c.ahead_of_peers ? 'check' : 'alert'}
                                            size={11}
                                            strokeWidth={2.2}
                                        />
                                        {c.verdict}
                                    </p>
                                </>
                            ) : (
                                <p className="mt-1.5 text-2xs text-ink-3">{c.verdict}</p>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="border-t border-line bg-surface-2 px-5 py-2.5">
                <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-3">
                    <Icon name="info" size={12} className="mt-px shrink-0" />
                    {benchmark.source}. The tick on each track marks the sector median.
                </p>
            </div>
        </div>
    );
};

export default PeerBenchmark;
