import React, { useState } from 'react';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { Pill } from '../ui/Status';
import { fileSize } from '../../lib/format';
import { FIELD_LABELS } from '../../lib/documents';
import { cn } from '../../lib/cn';
import type { CaseDocument } from '../../types/credit';

interface IngestedDocumentsProps {
    documents: CaseDocument[];
    onDelete: (docId: number) => Promise<void>;
}

const STATUS_MAP = {
    parsed: { status: 'good' as const, label: 'Parsed' },
    stored: { status: 'warning' as const, label: 'Stored only' },
    failed: { status: 'critical' as const, label: 'Failed' },
};

/** Renders one extracted value in the shape its field implies. */
function renderValue(key: string, value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? value.join('; ') : '—';
    if (typeof value === 'number') {
        if (key === 'promoter_stake' || key === 'promoter_pledge') return `${(value * 100).toFixed(1)}%`;
        if (key.endsWith('_pct') || key === 'effective_tax_rate') return `${value.toFixed(1)}%`;
        if (key.endsWith('_rs')) return value.toLocaleString('en-IN');
        return String(Math.round(value * 100) / 100);
    }
    return String(value);
}

/**
 * The documents already on the case, with what the ingestor got out of
 * each one. Deleting a document re-scores the case without it.
 */
const IngestedDocuments: React.FC<IngestedDocumentsProps> = ({ documents, onDelete }) => {
    const [open, setOpen] = useState<number | null>(null);
    const [confirming, setConfirming] = useState<number | null>(null);
    const [busy, setBusy] = useState<number | null>(null);

    if (documents.length === 0) {
        return (
            <EmptyState
                icon="file"
                title="No documents ingested yet"
                description="Stage the borrower's filings above and run the analysis to populate the case."
            />
        );
    }

    const handleDelete = async (docId: number) => {
        setBusy(docId);
        try {
            await onDelete(docId);
        } finally {
            setBusy(null);
            setConfirming(null);
        }
    };

    return (
        <ul className="divide-y divide-line">
            {documents.map((doc) => {
                const meta = STATUS_MAP[doc.parse_status] ?? STATUS_MAP.stored;
                const fields = Object.entries(doc.extracted ?? {}).filter(
                    ([k]) => k !== 'extraction_method',
                );
                const isOpen = open === doc.id;

                return (
                    <li key={doc.id}>
                        <div className="flex items-start gap-3 px-5 py-3">
                            <button
                                type="button"
                                onClick={() => setOpen(isOpen ? null : doc.id)}
                                disabled={fields.length === 0}
                                aria-expanded={isOpen}
                                className={cn(
                                    'flex min-w-0 flex-1 items-start gap-3 text-left',
                                    fields.length > 0 && 'cursor-pointer',
                                )}
                            >
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-surface-2 text-ink-2">
                                    <Icon name="file" size={15} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-medium text-ink" title={doc.filename}>
                                            {doc.filename}
                                        </p>
                                        <Pill status={meta.status}>{meta.label}</Pill>
                                    </div>
                                    <p className="mt-0.5 text-2xs text-ink-3">
                                        {doc.doc_label} · <span className="num">{fileSize(doc.size_bytes)}</span>
                                        {fields.length > 0 && (
                                            <>
                                                {' · '}
                                                <span className="text-[var(--accent-ink)]">
                                                    {fields.length} field{fields.length === 1 ? '' : 's'} extracted
                                                </span>
                                            </>
                                        )}
                                    </p>
                                    {doc.parse_message && (
                                        <p className="mt-1 text-2xs leading-relaxed text-ink-2">{doc.parse_message}</p>
                                    )}
                                </div>
                                {fields.length > 0 && (
                                    <Icon
                                        name="chevronRight"
                                        size={14}
                                        className={cn(
                                            'mt-1.5 shrink-0 text-ink-3 transition-transform',
                                            isOpen && 'rotate-90',
                                        )}
                                    />
                                )}
                            </button>

                            <div className="flex shrink-0 items-center gap-1.5">
                                {confirming === doc.id ? (
                                    <>
                                        <span className="text-2xs text-ink-2">Remove?</span>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            loading={busy === doc.id}
                                            onClick={() => handleDelete(doc.id)}
                                        >
                                            Confirm
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                                            Cancel
                                        </Button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setConfirming(doc.id)}
                                        aria-label={`Remove ${doc.filename}`}
                                        title="Remove and re-score without this document"
                                        className="rounded p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-[var(--critical-ink)]"
                                    >
                                        <Icon name="trash" size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {isOpen && fields.length > 0 && (
                            <div className="animate-fade-in border-t border-line bg-surface-2 px-5 py-3">
                                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                                    {fields.map(([key, value]) => (
                                        <div key={key} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                                            <dt className="text-2xs text-ink-2">{FIELD_LABELS[key] ?? key}</dt>
                                            <dd className="num shrink-0 text-2xs font-semibold text-ink">
                                                {renderValue(key, value)}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                {typeof doc.extracted?.extraction_method === 'string' && (
                                    <p className="mt-2.5 text-2xs text-ink-3">
                                        Text read via {doc.extracted.extraction_method}.
                                    </p>
                                )}
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default IngestedDocuments;
