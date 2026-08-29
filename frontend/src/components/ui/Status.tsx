import React from 'react';
import { cn } from '../../lib/cn';
import Icon, { type IconName } from './Icon';
import { STATUS_ICON, STATUS_MARK, STATUS_WASH } from './statusTokens';
import type { Status } from '../../lib/scoring';

interface PillProps {
    status?: Status;
    /** Pass null only where an adjacent icon already carries the status. */
    icon?: IconName | null;
    children: React.ReactNode;
    className?: string;
}

/** Compact status pill: wash + icon + written label. */
export const Pill: React.FC<PillProps> = ({ status = 'neutral', icon, children, className }) => {
    const name = icon === null ? null : (icon ?? STATUS_ICON[status]);
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded px-2 py-[3px] text-2xs font-semibold whitespace-nowrap',
                STATUS_WASH[status],
                className,
            )}
        >
            {name && <Icon name={name} size={12} strokeWidth={2.1} />}
            {children}
        </span>
    );
};

/** Neutral metadata tag, carrying no status meaning. */
export const Tag: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <span
        className={cn(
            'inline-flex items-center rounded border border-line bg-surface-2 px-2 py-[3px] text-2xs font-medium text-ink-2 whitespace-nowrap',
            className,
        )}
    >
        {children}
    </span>
);

/** 8px status dot — always accompanied by a text label at the call site. */
export const Dot: React.FC<{ status: Status; className?: string }> = ({ status, className }) => (
    <span
        className={cn('inline-block h-2 w-2 rounded-full shrink-0', className)}
        style={{ backgroundColor: STATUS_MARK[status] }}
    />
);
