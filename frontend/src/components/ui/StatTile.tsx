import React from 'react';
import { cn } from '../../lib/cn';
import { Pill } from './Status';
import Meter from './Meter';
import type { Status } from '../../lib/scoring';

interface StatTileProps {
    label: string;
    value: string;
    /** Small qualifier printed beside the figure, e.g. "/ 100". */
    unit?: string;
    caption?: string;
    status?: Status;
    statusLabel?: string;
    meter?: { value: number; threshold?: number; thresholdLabel?: string };
    className?: string;
}

/**
 * A single figure is the chart. Values use proportional digits at display
 * size; the status band is spelled out rather than implied by colour.
 */
const StatTile: React.FC<StatTileProps> = ({
    label,
    value,
    unit,
    caption,
    status = 'neutral',
    statusLabel,
    meter,
    className,
}) => (
    <div className={cn('panel flex flex-col gap-3 p-4', className)}>
        <div className="flex items-start justify-between gap-2">
            <p className="eyebrow">{label}</p>
            {statusLabel && <Pill status={status}>{statusLabel}</Pill>}
        </div>

        <div className="flex items-baseline gap-1.5">
            <span className="figure text-[26px] leading-none">{value}</span>
            {unit && <span className="text-[13px] font-medium text-ink-3">{unit}</span>}
        </div>

        {meter && (
            <Meter
                value={meter.value}
                status={status}
                threshold={meter.threshold}
                thresholdLabel={meter.thresholdLabel}
            />
        )}

        {caption && <p className="text-2xs leading-relaxed text-ink-3">{caption}</p>}
    </div>
);

export default StatTile;
