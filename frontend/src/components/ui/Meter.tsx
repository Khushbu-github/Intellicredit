import React from 'react';
import { cn } from '../../lib/cn';
import { STATUS_MARK } from './statusTokens';
import type { Status } from '../../lib/scoring';

interface MeterProps {
    /** Fill as a percentage, 0–100. */
    value: number;
    status?: Status;
    /** Optional policy threshold drawn as a hairline tick, 0–100. */
    threshold?: number;
    thresholdLabel?: string;
    height?: number;
    className?: string;
}

/**
 * A thin horizontal magnitude mark. The fill is anchored to the track's
 * left edge with a rounded data-end, and any policy threshold sits on top
 * as a solid hairline rather than a dashed rule.
 */
const Meter: React.FC<MeterProps> = ({
    value,
    status = 'neutral',
    threshold,
    thresholdLabel,
    height = 6,
    className,
}) => {
    const pct = Math.max(0, Math.min(100, value));
    const fill = status === 'neutral' ? 'var(--accent)' : STATUS_MARK[status];

    return (
        <div
            className={cn('relative w-full overflow-hidden rounded-full bg-surface-3', className)}
            style={{ height }}
        >
            <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%`, backgroundColor: fill }}
            />
            {threshold !== undefined && (
                <span
                    title={thresholdLabel}
                    className="absolute top-0 h-full w-[2px] bg-[var(--ink-3)] opacity-70"
                    style={{ left: `calc(${Math.max(0, Math.min(100, threshold))}% - 1px)` }}
                />
            )}
        </div>
    );
};

export default Meter;
