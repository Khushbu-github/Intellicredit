import React from 'react';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { Tag } from '../ui/Status';
import type { CovenantPackage } from '../../types/credit';

/**
 * The covenant package the risk profile calls for.
 *
 * Each term carries the reason it was proposed, so a credit committee can
 * see which weakness in the case each condition is answering rather than
 * being handed a boilerplate list.
 */
const Covenants: React.FC<{ covenants?: CovenantPackage | null }> = ({ covenants }) => {
    if (!covenants) {
        return (
            <EmptyState
                icon="shield"
                title="No covenant package yet"
                description="Covenants are generated from the scored risk profile once the case has been analysed."
            />
        );
    }

    const { financial_covenants: financial, conditions_precedent: conditions, monitoring } = covenants;

    return (
        <div>
            {financial.length > 0 && (
                <section>
                    <p className="eyebrow border-b border-line bg-surface-2 px-5 py-2">
                        Financial covenants · {financial.length}
                    </p>
                    <ul className="divide-y divide-line">
                        {financial.map((c) => (
                            <li key={c.covenant} className="px-5 py-3.5">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="text-[13px] font-semibold text-ink">{c.covenant}</p>
                                    <Tag>{c.threshold}</Tag>
                                </div>
                                <p className="mt-1 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-2">
                                    <Icon name="info" size={11} className="mt-0.5 shrink-0 text-ink-3" />
                                    {c.reason}
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {conditions.length > 0 && (
                <section>
                    <p className="eyebrow border-y border-line bg-surface-2 px-5 py-2">
                        Conditions precedent · {conditions.length}
                    </p>
                    <ul className="divide-y divide-line">
                        {conditions.map((c, i) => (
                            <li key={c.condition} className="flex gap-3 px-5 py-3.5">
                                <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[10px] text-ink-3">
                                    {i + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-medium leading-relaxed text-ink">{c.condition}</p>
                                    <p className="mt-1 text-2xs leading-relaxed text-ink-2">{c.reason}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {monitoring.length > 0 && (
                <section>
                    <p className="eyebrow border-y border-line bg-surface-2 px-5 py-2">
                        Ongoing monitoring · {monitoring.length}
                    </p>
                    <ul className="divide-y divide-line">
                        {monitoring.map((m) => (
                            <li key={m.item} className="flex items-center justify-between gap-3 px-5 py-3">
                                <span className="text-[13px] text-ink">{m.item}</span>
                                <Tag>{m.frequency}</Tag>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default Covenants;
