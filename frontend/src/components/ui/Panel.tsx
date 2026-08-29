import React from 'react';
import { cn } from '../../lib/cn';

interface PanelProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    /** Removes the default body padding — for tables and document surfaces. */
    flush?: boolean;
    className?: string;
    bodyClassName?: string;
    children: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({
    title,
    subtitle,
    actions,
    flush = false,
    className,
    bodyClassName,
    children,
}) => (
    <section className={cn('panel flex flex-col', className)}>
        {(title || actions) && (
            <header className="panel-head">
                <div className="min-w-0">
                    {title && <h2 className="panel-title truncate">{title}</h2>}
                    {subtitle && <p className="text-2xs text-ink-3 truncate mt-0.5">{subtitle}</p>}
                </div>
                {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            </header>
        )}
        <div className={cn(flush ? '' : 'p-5', 'flex-1 min-w-0', bodyClassName)}>{children}</div>
    </section>
);

export default Panel;
