import type { IconName } from './Icon';
import type { Status } from '../../lib/scoring';

/**
 * Status marks and their paired icons live apart from the components that
 * render them, so the UI files stay component-only.
 */

export const STATUS_MARK: Record<Status, string> = {
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    serious: 'var(--status-serious)',
    critical: 'var(--status-critical)',
    neutral: 'var(--ink-3)',
};

/** Status is never colour-alone: every mark ships with this icon beside it. */
export const STATUS_ICON: Record<Status, IconName> = {
    good: 'check',
    warning: 'alert',
    serious: 'alert',
    critical: 'alert',
    neutral: 'info',
};

export const STATUS_WASH: Record<Status, string> = {
    good: 'bg-[var(--good-wash)] text-[var(--good-ink)]',
    warning: 'bg-[var(--warning-wash)] text-[var(--warning-ink)]',
    serious: 'bg-[var(--serious-wash)] text-[var(--serious-ink)]',
    critical: 'bg-[var(--critical-wash)] text-[var(--critical-ink)]',
    neutral: 'bg-surface-3 text-ink-2',
};
