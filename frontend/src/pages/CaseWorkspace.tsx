/**
 * The per-case workspace.
 *
 * The open tab is a URL segment (/cases/12/assessment), so a case screen is
 * linkable, bookmarkable and survives the back button - none of which was true
 * when the workspace tracked the active tab in component state.
 *
 * All server state comes from the query hooks, so this file holds layout and
 * navigation only. It carries no loading flags and no manual re-fetching.
 */

import React, { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import CaseAssistant from '../components/CaseAssistant';
import Covenants from '../components/CAM/Covenants';
import DownloadButton from '../components/CAM/DownloadButton';
import NarrativePanel from '../components/CAM/NarrativePanel';
import Preview from '../components/CAM/Preview';
import Dashboard from '../components/Dashboard';
import ExplainTrail from '../components/ExplainTrail';
import PrimaryNotes from '../components/PrimaryNotes';
import Simulator from '../components/Simulator';
import UploadZone from '../components/UploadZone';
import Sidebar, { type NavItem, type TabKey } from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Panel from '../components/ui/Panel';
import { useToast } from '../components/ui/toastContext';
import {
    useBreakeven, useCase, useDeleteDocument, useDocuments, useEvents, useMeta,
    useReanalyze, useSimulate, useUpdateNotes,
} from '../hooks/queries';
import { caseRef } from '../lib/format';
import { useTheme } from '../lib/theme';
import type { SimulationInput } from '../types/credit';

const TABS: TabKey[] = [
    'documents', 'assessment', 'simulator', 'notes', 'assistant', 'trail', 'memo',
];

const CaseWorkspace: React.FC = () => {
    const { appId: rawId, tab } = useParams<{ appId: string; tab: string }>();
    const navigate = useNavigate();
    const toast = useToast();
    const { theme, toggle } = useTheme();
    const [collapsed, setCollapsed] = React.useState(false);

    const appId = Number.parseInt(rawId ?? '', 10);
    const validId = Number.isFinite(appId) && appId > 0;

    const metaQuery = useMeta();
    const caseQuery = useCase(validId ? appId : null);
    const documentsQuery = useDocuments(validId ? appId : null);
    const eventsQuery = useEvents(validId ? appId : null);

    const analysisData = caseQuery.data ?? null;
    const analysed = analysisData?.status === 'Analyzed';
    const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
    const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

    const breakevenQuery = useBreakeven(validId ? appId : null, analysed);
    const reanalyze = useReanalyze(validId ? appId : null);
    const deleteDocument = useDeleteDocument(validId ? appId : null);
    const updateNotes = useUpdateNotes(validId ? appId : null);
    const simulate = useSimulate(validId ? appId : null);

    // The backend reports whether a model is configured, so the optional
    // panels are hidden rather than offered as buttons that would 503.
    const llmAvailable = metaQuery.data?.features?.llm_assist ?? false;

    const companyName = analysisData?.company_name ?? 'Unnamed borrower';
    const activeTab = (TABS.includes(tab as TabKey) ? tab : 'documents') as TabKey;

    const goToTab = React.useCallback(
        (next: TabKey) => navigate(`/cases/${appId}/${next}`),
        [navigate, appId],
    );

    const reportError = React.useCallback(
        (title: string, err: unknown) =>
            toast({
                status: 'critical',
                title,
                detail: err instanceof Error ? err.message : 'The appraisal service did not respond.',
            }),
        [toast],
    );

    // --- Actions ----------------------------------------------------------

    const handleReanalyze = async () => {
        try {
            const result = await reanalyze.mutateAsync();
            toast({
                status: 'good',
                title: 'Case re-analysed',
                detail: `Composite ${result.total_score}/100 — ${result.decision}.`,
            });
        } catch (err) {
            reportError('Re-analysis failed', err);
        }
    };

    const handleDeleteDocument = async (docId: number) => {
        try {
            const result = await deleteDocument.mutateAsync(docId);
            toast({
                status: 'good',
                title: 'Document removed',
                detail: `The case was re-scored against the remaining ${result.remaining} document(s).`,
            });
        } catch (err) {
            reportError('Could not remove the document', err);
        }
    };

    const handleNotesUpdate = async (
        capacity: number, notes: string, mgmtQuality: number,
    ): Promise<string[]> => {
        const result = await updateNotes.mutateAsync({ capacity, notes, mgmtQuality });
        return result.overrides ?? [];
    };

    const handleSimulate = (input: SimulationInput) => simulate.mutateAsync(input);

    /**
     * After an ingestion run, move the analyst on to the result. The upload
     * mutation has already invalidated the case, so there is nothing to
     * re-fetch here - only somewhere to navigate.
     */
    const handleAnalysisComplete = async () => {
        if (activeTab === 'documents') goToTab('assessment');
    };

    // --- Navigation -------------------------------------------------------

    const navItems: NavItem[] = useMemo(
        () => [
            {
                key: 'documents', label: 'Documents', icon: 'upload', step: 2,
                hint: 'Stage and ingest borrower filings',
                done: documents.length > 0,
            },
            {
                key: 'assessment', label: 'Assessment', icon: 'gauge', step: 3,
                hint: '5Cs scoring and the sanctioning decision',
                locked: !analysed, lockedReason: 'Run the analysis first', done: analysed,
            },
            {
                key: 'simulator', label: 'What-if', icon: 'scales', step: 4,
                hint: 'Flex the inputs and re-run the decision',
                locked: !analysed, lockedReason: 'Run the analysis first',
            },
            {
                key: 'notes', label: 'Field notes', icon: 'notes', step: 5,
                hint: 'Relationship manager observations',
                locked: !analysed, lockedReason: 'Run the analysis first',
                done: analysisData?.factory_capacity != null,
            },
            {
                key: 'assistant', label: 'Assistant', icon: 'chat', step: 6,
                hint: 'Ask about this case',
                locked: !analysed, lockedReason: 'Run the analysis first',
            },
            {
                key: 'trail', label: 'Audit trail', icon: 'trail', step: 7,
                hint: 'How the recommendation was reached',
                locked: !analysed, lockedReason: 'Run the analysis first',
            },
            {
                key: 'memo', label: 'Appraisal memo', icon: 'document', step: 8,
                hint: 'Review and download the CAM',
                locked: !analysed, lockedReason: 'Run the analysis first',
            },
        ],
        [analysed, analysisData?.factory_capacity, documents.length],
    );

    // --- Guards -----------------------------------------------------------

    if (!validId) return <Navigate to="/cases" replace />;

    // A deleted case, or one belonging to another analyst, 404s from the API.
    if (caseQuery.isError) {
        return (
            <div className="min-h-screen bg-canvas p-8">
                <Panel flush>
                    <EmptyState
                        icon="document"
                        title="Case unavailable"
                        description="This case no longer exists, or it is not yours to view."
                        action={
                            <Button variant="primary" onClick={() => navigate('/cases')}>
                                Back to portfolio
                            </Button>
                        }
                    />
                </Panel>
            </div>
        );
    }

    if (caseQuery.isPending) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-canvas">
                <span className="text-[13px] text-ink-2">Loading case…</span>
            </div>
        );
    }

    // Deep link to a locked tab: send them to the step that unlocks it.
    if (!analysed && activeTab !== 'documents') {
        return <Navigate to={`/cases/${appId}/documents`} replace />;
    }

    return (
        <div className="flex min-h-screen bg-canvas">
            <Sidebar
                items={navItems}
                active={activeTab}
                onSelect={goToTab}
                collapsed={collapsed}
                onToggleCollapse={() => setCollapsed((c) => !c)}
                appId={appId}
                companyName={companyName}
                sector={analysisData?.sector ?? 'Manufacturing'}
                onBrowseCases={() => navigate('/cases')}
            />

            <div className="flex min-w-0 flex-1 flex-col">
                <Topbar
                    items={navItems}
                    active={activeTab}
                    onSelect={goToTab}
                    appId={appId}
                    companyName={companyName}
                    analysed={analysed}
                    decision={analysisData?.decision ?? null}
                    theme={theme}
                    onToggleTheme={toggle}
                    onNewCase={() => navigate('/cases/new')}
                    onBrowseCases={() => navigate('/cases')}
                />

                <main className="mx-auto w-full max-w-content flex-1 px-5 py-6 lg:px-8 lg:py-8">
                    <div key={activeTab} className="animate-fade-up">
                        {activeTab === 'documents' && (
                            <UploadZone
                                appId={appId}
                                documents={documents}
                                onAnalysisComplete={handleAnalysisComplete}
                                onDeleteDocument={handleDeleteDocument}
                            />
                        )}

                        {activeTab === 'assessment' &&
                            (analysisData && analysed ? (
                                <Dashboard
                                    data={analysisData}
                                    documentCount={documents.length}
                                    onReanalyze={handleReanalyze}
                                    reanalyzing={reanalyze.isPending}
                                />
                            ) : (
                                <Panel flush>
                                    <EmptyState
                                        icon="gauge"
                                        title="No assessment yet"
                                        description="Ingest the borrower documents to produce a 5Cs score and a sanctioning recommendation."
                                        action={
                                            <Button variant="primary" icon="upload" onClick={() => goToTab('documents')}>
                                                Go to documents
                                            </Button>
                                        }
                                    />
                                </Panel>
                            ))}

                        {activeTab === 'simulator' && (
                            <Simulator
                                data={analysisData}
                                breakeven={breakevenQuery.data ?? null}
                                onSimulate={handleSimulate}
                            />
                        )}

                        {activeTab === 'notes' && (
                            <PrimaryNotes data={analysisData} events={events} onUpdate={handleNotesUpdate} />
                        )}

                        {activeTab === 'assistant' && (
                            <CaseAssistant
                                appId={appId}
                                available={llmAvailable}
                                analysed={analysed}
                            />
                        )}

                        {activeTab === 'trail' && (
                            <ExplainTrail data={analysisData} documents={documents} events={events} />
                        )}

                        {activeTab === 'memo' && (
                            <div className="space-y-5">
                                <div className="flex flex-wrap items-end justify-between gap-4">
                                    <div>
                                        <p className="eyebrow">Step 8 · Output</p>
                                        <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">
                                            Credit appraisal memo
                                        </h1>
                                        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                                            Review the memo below, then download it as a Word document for the
                                            sanctioning file.
                                        </p>
                                    </div>
                                    <DownloadButton appId={appId} companyName={companyName} size="lg" />
                                </div>

                                <NarrativePanel
                                    appId={appId}
                                    narrative={analysisData?.narrative ?? null}
                                    available={llmAvailable}
                                />

                                <Panel
                                    title="Covenants and conditions"
                                    subtitle="Generated from the scored risk profile"
                                    flush
                                >
                                    <Covenants covenants={analysisData?.covenants} />
                                </Panel>

                                <Panel
                                    title={`CAM · ${caseRef(appId)}`}
                                    subtitle="Rendered from the case record"
                                    flush
                                    actions={
                                        <Button variant="ghost" size="sm" icon="print" onClick={() => window.print()}>
                                            Print
                                        </Button>
                                    }
                                >
                                    <Preview appId={appId} data={analysisData} companyName={companyName} />
                                </Panel>
                            </div>
                        )}
                    </div>
                </main>

                <footer className="border-t border-line px-5 py-5 lg:px-8">
                    <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 text-2xs text-ink-3">
                        <span>IntelliCredit · Corporate credit appraisal engine</span>
                        <span>Rules-based scoring · research inputs simulated · not a sanction</span>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default CaseWorkspace;
