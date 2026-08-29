import React, { useState } from 'react';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import { dateOf } from '../../lib/format';
import type { Theme } from '../../lib/theme';

interface NewCaseProps {
    onRegister: (companyName: string, sector: string) => Promise<void> | void;
    sectors: string[];
    theme: Theme;
    onToggleTheme: () => void;
    /** Shown only when there are existing cases to go back to. */
    onBrowseCases?: () => void;
    caseCount: number;
}

const CAPABILITIES = [
    {
        icon: 'upload' as const,
        title: 'Document ingestion',
        body: 'Ten document types parsed — annual reports, GST and bank registers, shareholding, ITR, bureau pulls, rating reports and board minutes.',
    },
    {
        icon: 'shield' as const,
        title: 'Fraud and conduct screening',
        body: 'Circular trading, ITR-to-GST turnover mismatch, cheque returns, promoter pledges and NI Act §138 matters.',
    },
    {
        icon: 'scales' as const,
        title: '5Cs risk scoring',
        body: 'Every pillar broken down to the component level, each showing the evidence it was scored on.',
    },
    {
        icon: 'document' as const,
        title: 'Credit Appraisal Memo',
        body: 'A bank-ready memo with limit working, covenants and conditions precedent, exported as Word.',
    },
];

const NewCase: React.FC<NewCaseProps> = ({
    onRegister, sectors, theme, onToggleTheme, onBrowseCases, caseCount,
}) => {
    const [name, setName] = useState('');
    const [sector, setSector] = useState('Manufacturing');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        setError(null);
        try {
            await onRegister(trimmed, sector);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not reach the appraisal service.');
            setBusy(false);
        }
    };

    return (
        <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
            {/* Brand column */}
            <section className="relative hidden flex-col justify-between bg-rail p-12 text-rail-ink lg:flex">
                <div className="flex items-center gap-2.5">
                    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
                        <rect width="32" height="32" rx="7" fill="#16223a" />
                        <path d="M8 21.5V10.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
                        <path d="M13.5 21.5V15M19 21.5V11.8M24.5 21.5V17.5" stroke="#3987e5" strokeWidth="2.6" strokeLinecap="round" />
                    </svg>
                    <span className="text-base font-semibold tracking-[-0.015em]">
                        Intelli<span className="text-[#7fb0f0]">Credit</span>
                    </span>
                </div>

                <div className="max-w-lg">
                    <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-[#7fb0f0]">
                        Corporate credit appraisal
                    </p>
                    <h1 className="mt-4 text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">
                        From borrower documents to a signed-off appraisal memo.
                    </h1>
                    <p className="mt-4 text-[15px] leading-relaxed text-rail-ink-2">
                        A single workspace for the front end of corporate underwriting — ingestion,
                        verification, 5Cs scoring, decisioning and CAM generation, with every step
                        traceable back to the document it came from.
                    </p>

                    <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                        {CAPABILITIES.map((c) => (
                            <li key={c.title} className="flex gap-3">
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rail-2 text-[#7fb0f0]">
                                    <Icon name={c.icon} size={16} />
                                </span>
                                <div>
                                    <p className="text-[13px] font-semibold text-rail-ink">{c.title}</p>
                                    <p className="mt-1 text-2xs leading-relaxed text-rail-ink-2">{c.body}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="text-2xs text-rail-ink-2">
                    Scoring and decisioning are rules-based and deterministic. Research inputs are
                    simulated in this build.
                </p>
            </section>

            {/* Form column */}
            <section className="flex flex-col bg-canvas">
                <div className="flex h-[60px] items-center justify-between px-6 lg:px-10">
                    <span className="flex items-center gap-2 text-sm font-semibold tracking-[-0.015em] text-ink lg:hidden">
                        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
                            <rect width="32" height="32" rx="7" fill="#0d1626" />
                            <path d="M8 21.5V10.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
                            <path d="M13.5 21.5V15M19 21.5V11.8M24.5 21.5V17.5" stroke="#3987e5" strokeWidth="2.6" strokeLinecap="round" />
                        </svg>
                        IntelliCredit
                    </span>
                    <button
                        type="button"
                        onClick={onToggleTheme}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                        className="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
                    </button>
                </div>

                <div className="flex flex-1 items-center justify-center px-6 pb-16 lg:px-10">
                    <div className="w-full max-w-[420px]">
                        <p className="eyebrow">Step 1 · Registration</p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink">Open an appraisal</h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                            Register the borrowing entity to create a case file. Documents, scoring
                            and the memo all attach to this case.
                        </p>

                        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                            <div>
                                <label htmlFor="company-name" className="mb-1.5 block text-[13px] font-medium text-ink">
                                    Borrower name
                                </label>
                                <input
                                    id="company-name"
                                    type="text"
                                    required
                                    autoFocus
                                    autoComplete="organization"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Sunrise Textiles Pvt Ltd"
                                    aria-describedby="company-name-hint"
                                    className="field h-11"
                                />
                                <p id="company-name-hint" className="mt-1.5 text-2xs text-ink-3">
                                    Use the registered entity name exactly as it appears on the MCA record.
                                </p>
                            </div>

                            <div>
                                <label htmlFor="sector" className="mb-1.5 block text-[13px] font-medium text-ink">
                                    Sector
                                </label>
                                <select
                                    id="sector"
                                    value={sector}
                                    onChange={(e) => setSector(e.target.value)}
                                    aria-describedby="sector-hint"
                                    className="field h-11"
                                >
                                    {(sectors.length ? sectors : ['Manufacturing']).map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                                <p id="sector-hint" className="mt-1.5 text-2xs text-ink-3">
                                    Sets the Conditions pillar outlook and the peer medians the borrower
                                    is benchmarked against.
                                </p>
                            </div>

                            {error && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2.5 rounded-md bg-[var(--critical-wash)] p-3 text-[13px] text-[var(--critical-ink)]"
                                >
                                    <Icon name="alert" size={15} className="mt-px shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                block
                                loading={busy}
                                iconRight="arrowRight"
                                disabled={!name.trim()}
                            >
                                {busy ? 'Creating case…' : 'Create case file'}
                            </Button>
                        </form>

                        {caseCount > 0 && onBrowseCases && (
                            <button
                                type="button"
                                onClick={onBrowseCases}
                                className="mt-5 flex w-full items-center justify-center gap-1.5 text-[13px] font-medium text-[var(--accent-ink)] hover:underline"
                            >
                                <Icon name="chevronLeft" size={14} />
                                Back to {caseCount} existing case{caseCount === 1 ? '' : 's'}
                            </button>
                        )}

                        <dl className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
                            {[
                                { k: 'Pillars scored', v: '5' },
                                { k: 'Policy gates', v: '5' },
                                { k: 'Opened', v: dateOf(new Date()) },
                            ].map((stat) => (
                                <div key={stat.k} className="bg-surface px-3 py-3 text-center">
                                    <dd className="figure text-[15px]">{stat.v}</dd>
                                    <dt className="mt-1 text-2xs text-ink-3">{stat.k}</dt>
                                </div>
                            ))}
                        </dl>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default NewCase;
