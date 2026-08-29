import React from 'react';
import { cn } from '../../lib/cn';
import Icon, { type IconName } from '../ui/Icon';
import { caseRef } from '../../lib/format';

export type TabKey =
    | 'documents' | 'assessment' | 'simulator' | 'notes' | 'assistant' | 'trail' | 'memo';

export interface NavItem {
    key: TabKey;
    label: string;
    icon: IconName;
    step: number;
    hint: string;
    /** Locked steps stay visible but are not selectable, with the reason shown. */
    locked?: boolean;
    lockedReason?: string;
    done?: boolean;
}

interface SidebarProps {
    items: NavItem[];
    active: TabKey;
    onSelect: (key: TabKey) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
    appId: number;
    companyName: string;
    sector: string;
    onBrowseCases: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    items, active, onSelect, collapsed, onToggleCollapse, appId, companyName, sector, onBrowseCases,
}) => (
    <aside
        className={cn(
            'sticky top-0 z-30 hidden h-screen shrink-0 flex-col bg-rail text-rail-ink-2 transition-[width] duration-200 md:flex',
            collapsed ? 'w-[68px]' : 'w-[248px]',
        )}
    >
        {/* Brand */}
        <div
            className={cn(
                'flex h-[60px] items-center gap-2.5 border-b border-rail-line',
                collapsed ? 'justify-center px-0' : 'px-5',
            )}
        >
            <svg width="24" height="24" viewBox="0 0 32 32" className="shrink-0" aria-hidden="true">
                <rect width="32" height="32" rx="7" fill="#16223a" />
                <path d="M8 21.5V10.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M13.5 21.5V15M19 21.5V11.8M24.5 21.5V17.5" stroke="#3987e5" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            {!collapsed && (
                <span className="text-[15px] font-semibold tracking-[-0.015em] text-rail-ink">
                    Intelli<span className="text-[#7fb0f0]">Credit</span>
                </span>
            )}
        </div>

        {/* Case context */}
        {collapsed ? (
            <button
                type="button"
                onClick={onBrowseCases}
                title="Back to all cases"
                aria-label="Back to all cases"
                className="mx-2 mt-3 flex h-10 items-center justify-center rounded-md text-rail-ink-2 transition-colors hover:bg-rail-2 hover:text-rail-ink"
            >
                <Icon name="building" size={17} />
            </button>
        ) : (
            <div className="border-b border-rail-line px-5 py-4">
                <button
                    type="button"
                    onClick={onBrowseCases}
                    className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-rail-ink-2 transition-colors hover:text-rail-ink"
                >
                    <Icon name="chevronLeft" size={12} />
                    All cases
                </button>
                <p className="mt-2 truncate text-[13px] font-semibold text-rail-ink" title={companyName}>
                    {companyName}
                </p>
                <p className="num mt-0.5 font-mono text-2xs text-rail-ink-2">
                    {caseRef(appId)} · {sector}
                </p>
            </div>
        )}

        {/* Workflow steps */}
        <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')} aria-label="Appraisal workflow">
            {!collapsed && (
                <p className="px-2 pb-2 pt-1 text-2xs font-semibold uppercase tracking-[0.08em] text-rail-ink-2">
                    Workflow
                </p>
            )}
            <ul className="space-y-0.5">
                {items.map((item) => {
                    const isActive = active === item.key;
                    return (
                        <li key={item.key}>
                            <button
                                type="button"
                                onClick={() => !item.locked && onSelect(item.key)}
                                disabled={item.locked}
                                aria-current={isActive ? 'page' : undefined}
                                title={collapsed ? item.label : item.locked ? item.lockedReason : item.hint}
                                className={cn(
                                    'group relative flex w-full items-center rounded-md text-[13px] font-medium transition-colors',
                                    collapsed ? 'h-10 justify-center' : 'gap-3 px-3 py-2.5',
                                    isActive
                                        ? 'bg-rail-2 text-rail-ink'
                                        : item.locked
                                            ? 'cursor-not-allowed text-rail-ink-2 opacity-40'
                                            : 'text-rail-ink-2 hover:bg-rail-2/70 hover:text-rail-ink',
                                )}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[#3987e5]" />
                                )}
                                <Icon name={item.locked ? 'lock' : item.icon} size={17} className="shrink-0" />
                                {!collapsed && (
                                    <>
                                        <span className="flex-1 text-left">{item.label}</span>
                                        {item.done ? (
                                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--status-good)] text-white">
                                                <Icon name="check" size={10} strokeWidth={3} />
                                            </span>
                                        ) : (
                                            <span className="num font-mono text-2xs opacity-50">{item.step}</span>
                                        )}
                                    </>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>

        <div className={cn('border-t border-rail-line py-3', collapsed ? 'px-2' : 'px-3')}>
            <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                className={cn(
                    'flex w-full items-center rounded-md py-2 text-2xs font-medium text-rail-ink-2 transition-colors hover:bg-rail-2 hover:text-rail-ink',
                    collapsed ? 'justify-center' : 'gap-3 px-3',
                )}
            >
                <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
                {!collapsed && <span>Collapse</span>}
            </button>
        </div>
    </aside>
);

export default Sidebar;
