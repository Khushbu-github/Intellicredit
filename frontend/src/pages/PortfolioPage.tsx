/** The case portfolio, plus the signed-in analyst's account controls. */

import React from 'react';
import { useNavigate } from 'react-router-dom';

import Portfolio from '../components/Portfolio';
import { useToast } from '../components/ui/toastContext';
import { useCases, useDeleteCase } from '../hooks/queries';
import { caseRef } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/useAuth';

const PortfolioPage: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const { theme, toggle } = useTheme();
    const { user, signOut } = useAuth();

    const casesQuery = useCases();
    const deleteCase = useDeleteCase();

    const handleDelete = async (id: number) => {
        try {
            await deleteCase.mutateAsync(id);
            toast({
                status: 'good',
                title: 'Case deleted',
                detail: `${caseRef(id)} and its documents were removed.`,
            });
        } catch (err) {
            toast({
                status: 'critical',
                title: 'Could not delete the case',
                detail: err instanceof Error ? err.message : 'The appraisal service did not respond.',
            });
        }
    };

    return (
        <div className="min-h-screen bg-canvas">
            <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
                <div className="mx-auto flex h-[60px] max-w-content items-center gap-4 px-5 lg:px-8">
                    <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.015em] text-ink">
                        <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
                            <rect width="32" height="32" rx="7" fill="#0d1626" />
                            <path d="M8 21.5V10.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
                            <path
                                d="M13.5 21.5V15M19 21.5V11.8M24.5 21.5V17.5"
                                stroke="#3987e5"
                                strokeWidth="2.6"
                                strokeLinecap="round"
                            />
                        </svg>
                        Intelli<span className="text-[var(--accent-ink)]">Credit</span>
                    </span>

                    <span className="ml-auto hidden text-2xs text-ink-3 sm:inline">
                        {user?.full_name || user?.email}
                    </span>

                    <button
                        type="button"
                        onClick={toggle}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                        <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                        >
                            <path
                                d={
                                    theme === 'dark'
                                        ? 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z'
                                        : 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z'
                                }
                            />
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            signOut();
                            navigate('/login', { replace: true });
                        }}
                        className="rounded-md border border-line-strong px-3 py-1.5 text-2xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                        Sign out
                    </button>
                </div>
            </header>

            <main className="mx-auto w-full max-w-content px-5 py-6 lg:px-8 lg:py-8">
                <Portfolio
                    cases={casesQuery.data ?? []}
                    loading={casesQuery.isPending}
                    onOpen={(id) => navigate(`/cases/${id}/documents`)}
                    onDelete={handleDelete}
                    onNewCase={() => navigate('/cases/new')}
                    onRefresh={() => casesQuery.refetch()}
                />
            </main>
        </div>
    );
};

export default PortfolioPage;
