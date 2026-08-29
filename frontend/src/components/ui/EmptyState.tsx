import React from 'react';
import Icon, { type IconName } from './Icon';

interface EmptyStateProps {
    icon?: IconName;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon = 'info', title, description, action }) => (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3">
            <Icon name={icon} size={20} />
        </span>
        <div className="max-w-sm space-y-1">
            <p className="text-sm font-semibold text-ink">{title}</p>
            {description && <p className="text-[13px] leading-relaxed text-ink-2">{description}</p>}
        </div>
        {action && <div className="pt-1">{action}</div>}
    </div>
);

export default EmptyState;
