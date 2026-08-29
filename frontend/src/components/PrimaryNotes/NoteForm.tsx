import React, { useState } from 'react';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { Pill } from '../ui/Status';
import { cn } from '../../lib/cn';

interface NoteFormProps {
    onSubmit: (capacity: number, notes: string, mgmtQuality: number) => Promise<void> | void;
    busy: boolean;
    initialCapacity?: number | null;
    initialQuality?: number | null;
    initialNotes?: string | null;
}

const MAX_NOTES = 1200;

/** Phrases the backend's keyword rules act on, offered as one-click inserts. */
const QUICK_NOTES = [
    { label: 'Under-utilised plant', text: 'Plant found under-utilised during the site visit.' },
    { label: 'Poor management', text: 'Poor management responses on the working-capital cycle.' },
    { label: 'Suspected diversion', text: 'Possible diversion of funds to group entities.' },
    { label: 'Order book confirmed', text: 'Order book confirmed for the next two quarters.' },
];

const capacityBand = (v: number) =>
    v < 50 ? { label: 'Critical', status: 'critical' as const }
        : v < 60 ? { label: 'Below policy', status: 'warning' as const }
            : v < 80 ? { label: 'Adequate', status: 'neutral' as const }
                : { label: 'Optimal', status: 'good' as const };

const NoteForm: React.FC<NoteFormProps> = ({
    onSubmit, busy, initialCapacity, initialQuality, initialNotes,
}) => {
    const [capacity, setCapacity] = useState(
        initialCapacity != null ? Math.round(initialCapacity * 100) : 100,
    );
    const [notes, setNotes] = useState(initialNotes ?? '');
    const [mgmtQuality, setMgmtQuality] = useState(initialQuality ?? 3);

    const band = capacityBand(capacity);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(capacity / 100, notes.trim(), mgmtQuality);
    };

    const insert = (text: string) =>
        setNotes((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text).slice(0, MAX_NOTES));

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Capacity utilisation */}
            <div>
                <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="capacity" className="text-[13px] font-medium text-ink">
                        Observed capacity utilisation
                    </label>
                    <div className="flex items-center gap-2.5">
                        <span className="num figure text-[15px]">{capacity}%</span>
                        <Pill status={band.status}>{band.label}</Pill>
                    </div>
                </div>

                <input
                    id="capacity"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={capacity}
                    onChange={(e) => setCapacity(Number.parseInt(e.target.value, 10))}
                    aria-describedby="capacity-hint"
                    className="mt-3 w-full"
                />
                <div className="num mt-1.5 flex justify-between text-2xs text-ink-3">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                </div>
                <p id="capacity-hint" className="mt-2 text-2xs leading-relaxed text-ink-3">
                    This feeds the Capacity pillar directly: full marks at 80% and above, partial
                    below that, and nothing below 50%.
                </p>
            </div>

            {/* Management quality */}
            <div>
                <span className="mb-2 block text-[13px] font-medium text-ink">Management quality</span>
                <div role="radiogroup" aria-label="Management quality" className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            type="button"
                            role="radio"
                            aria-checked={star === mgmtQuality}
                            aria-label={`${star} of 5`}
                            onClick={() => setMgmtQuality(star)}
                            className={cn(
                                'rounded p-1 transition-colors',
                                star <= mgmtQuality
                                    ? 'text-[var(--status-warning)]'
                                    : 'text-ink-3 opacity-50 hover:opacity-100',
                            )}
                        >
                            <Icon name="star" size={20} filled={star <= mgmtQuality} strokeWidth={1.4} />
                        </button>
                    ))}
                    <span className="num ml-2 text-2xs text-ink-3">{mgmtQuality} of 5</span>
                </div>
                <p className="mt-2 text-2xs text-ink-3">
                    Recorded on the case and carried into the appraisal memo.
                </p>
            </div>

            {/* Observations */}
            <div>
                <div className="flex items-baseline justify-between">
                    <label htmlFor="observations" className="text-[13px] font-medium text-ink">
                        Qualitative observations
                    </label>
                    <span className="num text-2xs text-ink-3">
                        {notes.length} / {MAX_NOTES}
                    </span>
                </div>
                <textarea
                    id="observations"
                    value={notes}
                    maxLength={MAX_NOTES}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Record what the documents do not show — plant condition, order book, promoter conduct, succession risk."
                    className="field mt-1.5 h-28 resize-y leading-relaxed"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_NOTES.map((q) => (
                        <button
                            key={q.label}
                            type="button"
                            onClick={() => insert(q.text)}
                            title={q.text}
                            className="rounded border border-line bg-surface-2 px-2 py-1 text-2xs text-ink-2 transition-colors hover:border-[var(--accent)] hover:text-ink"
                        >
                            + {q.label}
                        </button>
                    ))}
                </div>
            </div>

            <Button type="submit" variant="primary" size="lg" block loading={busy} iconRight="refresh">
                {busy ? 'Re-scoring case…' : 'Submit notes and re-score'}
            </Button>
        </form>
    );
};

export default NoteForm;
