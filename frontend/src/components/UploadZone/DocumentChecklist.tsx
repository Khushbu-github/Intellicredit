import React from 'react';
import Icon from '../ui/Icon';
import { Pill } from '../ui/Status';
import { DOC_TYPES } from '../../lib/documents';

interface DocumentChecklistProps {
    /** Keys of document types matched by the currently staged or ingested files. */
    matched: Set<string>;
}

/**
 * The expected document set, with each row showing what the ingestor will
 * pull out of it and whether a matching file is present.
 */
const DocumentChecklist: React.FC<DocumentChecklistProps> = ({ matched }) => {
    const required = DOC_TYPES.filter((d) => d.required);
    const optional = DOC_TYPES.filter((d) => !d.required);

    const row = (doc: (typeof DOC_TYPES)[number]) => {
        const present = matched.has(doc.key);
        return (
            <li key={doc.key} className="flex items-start gap-3 px-5 py-3">
                <span
                    className={
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ' +
                        (present
                            ? 'border-transparent bg-[var(--status-good)] text-white'
                            : 'border-line-strong text-ink-3')
                    }
                >
                    <Icon name={present ? 'check' : 'file'} size={12} strokeWidth={present ? 3 : 1.8} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-ink">{doc.label}</p>
                        {doc.required ? (
                            <Pill status={present ? 'good' : 'warning'}>{present ? 'Received' : 'Required'}</Pill>
                        ) : present ? (
                            <Pill status="good">Received</Pill>
                        ) : (
                            <span className="text-2xs text-ink-3">Optional</span>
                        )}
                    </div>
                    <p className="mt-0.5 text-2xs text-ink-3">{doc.accepts}</p>
                    <p className="mt-1 text-2xs leading-relaxed text-ink-2">{doc.extracts}</p>
                    <p className="mt-1 font-mono text-2xs text-ink-3">
                        Name must contain &ldquo;{doc.keywords[0]}&rdquo; · {doc.exts.join(' or ')}
                    </p>
                </div>
            </li>
        );
    };

    return (
        <div>
            <p className="eyebrow border-b border-line bg-surface-2 px-5 py-2">
                Required · {required.filter((d) => matched.has(d.key)).length} of {required.length}
            </p>
            <ul className="divide-y divide-line">{required.map(row)}</ul>

            <p className="eyebrow border-y border-line bg-surface-2 px-5 py-2">
                Adds signal · {optional.filter((d) => matched.has(d.key)).length} of {optional.length}
            </p>
            <ul className="divide-y divide-line">{optional.map(row)}</ul>
        </div>
    );
};

export default DocumentChecklist;
