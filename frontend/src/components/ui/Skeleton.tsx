import React from 'react';
import { cn } from '../../lib/cn';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
    <div className={cn('relative overflow-hidden rounded bg-surface-3', className)}>
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[var(--surface)] to-transparent opacity-60" />
    </div>
);

export default Skeleton;
