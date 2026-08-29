import React from 'react';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import { Pill, Tag } from '../ui/Status';
import { caseRef } from '../../lib/format';
import { decisionStatus } from '../../lib/scoring';
import type { Theme } from '../../lib/theme';
import type { TabKey, NavItem } from './Sidebar';

interface TopbarProps {
    items: NavItem[];
    active: TabKey;
    onSelect: (key: TabKey) => void;
    appId: number;
    companyName: string;
    analysed: boolean;
    decision: string | null;
    theme: Theme;
    onToggleTheme: () => void;
    onNewCase: () => void;
    onBrowseCases: () => void;
}

const Topbar: React.FC<TopbarProps> = ({
    items, active, onSelect, appId, companyName, analysed, decision,
    theme, onToggleTheme, onNewCase, onBrowseCases,
}) => {
    const current = items.find((i) => i.key === active);

    return (
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="flex h-[60px] items-center gap-4 px-5 lg:px-8">
                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
                    <button
                        type="button"
                        onClick={onBrowseCases}
                        className="hidden shrink-0 font-medium text-ink-2 transition-colors hover:text-[var(--accent-ink)] sm:inline"
                    >
                        Cases
                    </button>
                    <Icon name="chevronRight" size={13} className="hidden shrink-0 text-ink-3 sm:block" />
                    <span className="hidden truncate font-medium text-ink-2 md:inline" title={companyName}>
                        {companyName}
                    </span>
                    <Icon name="chevronRight" size={13} className="hidden shrink-0 text-ink-3 md:block" />
                    <span className="truncate font-semibold text-ink">{current?.label ?? 'Overview'}</span>
                </nav>

                <div className="ml-auto flex items-center gap-2.5">
                    <Tag className="hidden font-mono lg:inline-flex">{caseRef(appId)}</Tag>

                    {decision ? (
                        <Pill status={decisionStatus(decision)}>{decision}</Pill>
                    ) : (
                        <Pill status={analysed ? 'good' : 'neutral'} icon={analysed ? 'check' : 'info'}>
                            {analysed ? 'Analysed' : 'Awaiting documents'}
                        </Pill>
                    )}

                    <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

                    <button
                        type="button"
                        onClick={onToggleTheme}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
                    </button>

                    <Button variant="secondary" size="md" icon="plus" onClick={onNewCase}>
                        <span className="hidden sm:inline">New case</span>
                    </Button>
                </div>
            </div>

            {/* Mobile workflow tabs — the rail is hidden below md */}
            <nav
                className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 md:hidden"
                aria-label="Appraisal workflow"
            >
                <button
                    type="button"
                    onClick={onBrowseCases}
                    className="flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-2xs font-semibold text-ink-2 transition-colors hover:bg-surface-3"
                >
                    <Icon name="building" size={13} />
                    Cases
                </button>
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        disabled={item.locked}
                        onClick={() => onSelect(item.key)}
                        aria-current={active === item.key ? 'page' : undefined}
                        className={
                            'flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-2xs font-semibold transition-colors ' +
                            (active === item.key
                                ? 'bg-[var(--accent-wash)] text-[var(--accent-ink)]'
                                : item.locked
                                    ? 'text-ink-3 opacity-45'
                                    : 'text-ink-2 hover:bg-surface-3')
                        }
                    >
                        <Icon name={item.locked ? 'lock' : item.icon} size={13} />
                        {item.label}
                    </button>
                ))}
            </nav>
        </header>
    );
};

export default Topbar;
