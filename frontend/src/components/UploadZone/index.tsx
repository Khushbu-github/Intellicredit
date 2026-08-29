import React, { useCallback, useMemo, useRef, useState } from 'react';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import DocumentChecklist from './DocumentChecklist';
import IngestedDocuments from './IngestedDocuments';
import { Pill, Tag } from '../ui/Status';
import { useToast } from '../ui/toastContext';
import { useFileUpload } from '../../hooks/useFileUpload';
import { classify, unmatchedReason, DOC_TYPES } from '../../lib/documents';
import { fileSize } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { CaseDocument } from '../../types/credit';

interface UploadZoneProps {
    appId: number;
    documents: CaseDocument[];
    onAnalysisComplete: () => Promise<void>;
    onDeleteDocument: (docId: number) => Promise<void>;
}

const UploadZone: React.FC<UploadZoneProps> = ({
    appId, documents, onAnalysisComplete, onDeleteDocument,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [staged, setStaged] = useState<File[]>([]);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { uploadFiles, isUploading } = useFileUpload(appId);
    const toast = useToast();

    const addFiles = useCallback((incoming: FileList | null) => {
        if (!incoming?.length) return;
        setError(null);
        setStaged((prev) => {
            const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
            return [...prev, ...Array.from(incoming).filter((f) => !seen.has(`${f.name}:${f.size}`))];
        });
    }, []);

    const removeFile = (index: number) => setStaged((prev) => prev.filter((_, i) => i !== index));

    /** Document types covered by files already ingested or currently staged. */
    const matched = useMemo(() => {
        const keys = new Set<string>();
        documents.forEach((d) => {
            if (d.doc_type && d.doc_type !== 'unclassified') keys.add(d.doc_type);
        });
        staged.forEach((f) => {
            const type = classify(f.name);
            if (type) keys.add(type.key);
        });
        return keys;
    }, [documents, staged]);

    const missingRequired = DOC_TYPES.filter((d) => d.required && !matched.has(d.key));
    const parsedCount = staged.filter((f) => classify(f.name)).length;
    const failedCount = documents.filter((d) => d.parse_status === 'failed').length;

    const handleRun = async () => {
        if (staged.length === 0) return;
        setError(null);
        try {
            const result = await uploadFiles(staged);
            setStaged([]);
            toast({
                status: 'good',
                title: 'Analysis complete',
                detail: result
                    ? `${result.parsed_count} of ${result.ingested.length} document(s) parsed. Composite ${result.total_score ?? '—'}/100 — ${result.decision ?? 'pending'}.`
                    : 'Documents ingested and scored.',
            });
            await onAnalysisComplete();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'The analysis service did not respond.';
            setError(message);
            toast({ status: 'critical', title: 'Ingestion failed', detail: message });
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow">Step 2 · Intake</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Borrower documents</h1>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                        Stage the borrower&rsquo;s filings, then run the ingestion pass. Files are routed by
                        filename, so name them to match the checklist. Re-uploading a file replaces it
                        rather than double-counting.
                    </p>
                </div>
                {documents.length > 0 && (
                    <Tag>
                        {documents.length} on file{failedCount > 0 ? ` · ${failedCount} failed` : ''}
                    </Tag>
                )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <div className="space-y-5">
                    {/* Drop zone */}
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                        className={cn(
                            'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                            dragging ? 'border-[var(--accent)] bg-[var(--accent-wash)]' : 'border-line-strong bg-surface',
                        )}
                    >
                        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2">
                            <Icon name="upload" size={20} />
                        </span>
                        <p className="text-sm font-semibold text-ink">Drop documents here</p>
                        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-2">
                            PDF, CSV and JSON are parsed. Any other format is stored against the case
                            but not read.
                        </p>
                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            className="sr-only"
                            accept=".pdf,.csv,.json,.xlsx,.png,.jpg"
                            onChange={(e) => {
                                addFiles(e.target.files);
                                e.target.value = '';
                            }}
                        />
                        <Button variant="secondary" className="mt-4" icon="file" onClick={() => inputRef.current?.click()}>
                            Browse files
                        </Button>
                    </div>

                    {/* Staging */}
                    <Panel
                        title="Staged for ingestion"
                        subtitle={
                            staged.length === 0
                                ? 'Nothing staged yet'
                                : `${staged.length} file${staged.length === 1 ? '' : 's'} · ${parsedCount} will be parsed`
                        }
                        flush
                        actions={
                            staged.length > 0 && (
                                <Button variant="ghost" size="sm" icon="trash" onClick={() => setStaged([])}>
                                    Clear
                                </Button>
                            )
                        }
                    >
                        {staged.length === 0 ? (
                            <EmptyState
                                icon="file"
                                title="No documents staged"
                                description="Add the annual report, GST returns and bank statement for a complete appraisal. Rating reports, board minutes, shareholding patterns and the bureau pull all add signal."
                            />
                        ) : (
                            <ul className="divide-y divide-line">
                                {staged.map((file, i) => {
                                    const type = classify(file.name);
                                    return (
                                        <li key={`${file.name}-${i}`} className="flex items-center gap-3 px-5 py-3">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-surface-2 text-ink-2">
                                                <Icon name="file" size={15} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[13px] font-medium text-ink" title={file.name}>
                                                    {file.name}
                                                </p>
                                                <p className="mt-0.5 text-2xs text-ink-3">
                                                    <span className="num">{fileSize(file.size)}</span>
                                                    {' · '}
                                                    {type ? `Routed to ${type.label}` : unmatchedReason(file.name)}
                                                </p>
                                            </div>
                                            <Pill status={type ? 'good' : 'warning'}>
                                                {type ? 'Will parse' : 'Store only'}
                                            </Pill>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(i)}
                                                aria-label={`Remove ${file.name}`}
                                                className="rounded p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                                            >
                                                <Icon name="close" size={14} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Panel>

                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-2.5 rounded-md border border-line bg-[var(--critical-wash)] p-3.5 text-[13px] text-[var(--critical-ink)]"
                        >
                            <Icon name="alert" size={15} className="mt-px shrink-0" />
                            <div>
                                <p className="font-semibold">Ingestion failed</p>
                                <p className="mt-0.5 leading-relaxed opacity-90">{error}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
                        <div className="text-2xs text-ink-2">
                            {missingRequired.length > 0 ? (
                                <span className="flex items-center gap-1.5">
                                    <Icon name="alert" size={13} className="text-[var(--status-warning)]" />
                                    Missing: {missingRequired.map((d) => d.label).join(', ')}
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Icon name="check" size={13} className="text-[var(--status-good)]" />
                                    All required documents accounted for
                                </span>
                            )}
                        </div>
                        <Button
                            variant="primary"
                            size="lg"
                            iconRight="arrowRight"
                            loading={isUploading}
                            disabled={staged.length === 0}
                            onClick={handleRun}
                        >
                            {isUploading ? 'Ingesting and scoring…' : 'Run analysis'}
                        </Button>
                    </div>

                    {/* Already on file */}
                    <Panel
                        title="Documents on file"
                        subtitle={
                            documents.length === 0
                                ? 'Nothing ingested yet'
                                : `${documents.length} document${documents.length === 1 ? '' : 's'} · select one to see what was extracted`
                        }
                        flush
                    >
                        <IngestedDocuments documents={documents} onDelete={onDeleteDocument} />
                    </Panel>
                </div>

                <Panel
                    title="Document checklist"
                    subtitle="What the ingestor looks for"
                    flush
                    className="lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-100px)] lg:self-start lg:overflow-y-auto"
                >
                    <DocumentChecklist matched={matched} />
                </Panel>
            </div>
        </div>
    );
};

export default UploadZone;
