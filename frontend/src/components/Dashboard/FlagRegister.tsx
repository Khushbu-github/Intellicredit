import React from 'react';
import Icon from '../ui/Icon';
import { Dot } from '../ui/Status';
import { severityStatus, sortedFlags } from '../../lib/scoring';
import type { RedFlag } from '../../types/credit';

/**
 * Screening exceptions raised by the ingestion and research passes.
 *
 * This is the narrative register - what was found and why it matters -
 * complementing the measured register, which shows values against their
 * policy thresholds.
 */
const FlagRegister: React.FC<{ flags?: RedFlag[] | null }> = ({ flags }) => {
    const items = sortedFlags(flags);

    if (items.length === 0) {
        return (
            <div className="flex items-center gap-2.5 px-5 py-6">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--status-good)] text-white">
                    <Icon name="check" size={13} strokeWidth={3} />
                </span>
                <p className="text-[13px] text-ink-2">
                    No screening exceptions were raised against this case.
                </p>
            </div>
        );
    }

    return (
        <ul className="divide-y divide-line">
            {items.map((flag, i) => (
                <li key={`${flag.code}-${i}`} className="flex items-start gap-3 px-5 py-3.5">
                    <Dot status={severityStatus(flag.severity)} className="mt-[7px]" />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[13px] font-semibold text-ink">{flag.title}</p>
                            <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                                {flag.severity}
                            </span>
                        </div>
                        <p className="mt-0.5 text-2xs leading-relaxed text-ink-2">{flag.detail}</p>
                    </div>
                </li>
            ))}
        </ul>
    );
};

export default FlagRegister;
