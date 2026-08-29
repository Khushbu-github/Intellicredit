import React, { useState } from 'react';
import Panel from '../ui/Panel';
import Icon from '../ui/Icon';
import NoteForm from './NoteForm';
import EmptyState from '../ui/EmptyState';
import { Pill } from '../ui/Status';
import { useToast } from '../ui/toastContext';
import { decisionStatus, scoreStatus } from '../../lib/scoring';
import { score as fmtScore, timeOf, dateOf } from '../../lib/format';
import type { Application, ScoreEvent } from '../../types/credit';

interface PrimaryNotesProps {
    data: Application | null;
    events: ScoreEvent[];
    onUpdate: (capacity: number, notes: string, mgmtQuality: number) => Promise<string[]>;
}

const parseDate = (value: string) => {
    const d = new Date(value.endsWith('Z') ? value : `${value}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Human-in-the-loop adjustments.
 *
 * The observed utilisation now feeds the Capacity pillar through the same
 * scoring pipeline as every other input, so its effect shows up in the
 * pillar breakdown rather than as an opaque penalty applied afterwards.
 * The keyword overrides are applied on top and reported explicitly.
 */
const PrimaryNotes: React.FC<PrimaryNotesProps> = ({ data, events, onUpdate }) => {
    const [busy, setBusy] = useState(false);
    const toast = useToast();

    const noteEvents = events.filter((e) => e.trigger === 'primary_notes');

    const handleSubmit = async (capacity: number, notes: string, mgmtQuality: number) => {
        setBusy(true);
        try {
            const overrides = await onUpdate(capacity, notes, mgmtQuality);
            toast({
                status: 'good',
                title: 'Case re-scored',
                detail: overrides.length
                    ? `${overrides.length} manual override applied. See the assessment tab.`
                    : 'Field notes applied and the case re-scored.',
            });
        } catch (err) {
            toast({
                status: 'critical',
                title: 'Could not apply notes',
                detail: err instanceof Error ? err.message : 'The appraisal service did not respond.',
            });
        } finally {
            setBusy(false);
        }
    };

    if (!data || data.total_score == null) {
        return (
            <div className="space-y-5">
                <div>
                    <p className="eyebrow">Step 5 · Field input</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">
                        Relationship manager notes
                    </h1>
                </div>
                <Panel flush>
                    <EmptyState
                        icon="notes"
                        title="Analyse the case first"
                        description="Field notes adjust an existing score, so the case needs a baseline before observations can be applied."
                    />
                </Panel>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div>
                <p className="eyebrow">Step 5 · Field input</p>
                <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">
                    Relationship manager notes
                </h1>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                    Record observations from the site visit and management meeting. Submitting
                    re-scores the case immediately and can overturn the recommendation.
                </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Panel
                    title="Site visit assessment"
                    subtitle="Feeds the Capacity and Character pillars"
                    actions={
                        data.factory_capacity != null && (
                            <Pill status="neutral" icon="check">
                                Previously recorded
                            </Pill>
                        )
                    }
                >
                    <NoteForm
                        onSubmit={handleSubmit}
                        busy={busy}
                        initialCapacity={data.factory_capacity}
                        initialQuality={data.mgmt_quality}
                        initialNotes={data.qualitative_notes}
                    />
                </Panel>

                <div className="space-y-5">
                    <Panel title="How notes are applied" flush>
                        <div className="border-b border-line px-5 py-3">
                            <p className="eyebrow">Scored through the model</p>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                                Observed utilisation is a Capacity component worth 5 of the pillar&rsquo;s
                                30 points: full marks at 80% and above, 3 at 60–79%, 1 at 50–59%, and
                                nothing below 50%.
                            </p>
                        </div>

                        <p className="eyebrow border-b border-line bg-surface-2 px-5 py-2">
                            Manual overrides on top
                        </p>
                        <ul className="divide-y divide-line text-[13px]">
                            {[
                                { trigger: 'Note mentions “underutil”', effect: 'Capacity reduced by a further 5 points' },
                                { trigger: 'Note mentions poor, bad or weak management', effect: 'Character reduced by 5 points' },
                                { trigger: 'Note mentions diversion or siphoning', effect: 'Character reduced by 8 points' },
                            ].map((rule) => (
                                <li key={rule.trigger} className="flex gap-3 px-5 py-3">
                                    <Icon name="arrowRight" size={14} className="mt-1 shrink-0 text-ink-3" />
                                    <div>
                                        <p className="font-medium text-ink">{rule.trigger}</p>
                                        <p className="mt-0.5 text-2xs leading-relaxed text-ink-2">{rule.effect}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="border-t border-line bg-surface-2 px-5 py-3">
                            <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-2">
                                <Icon name="info" size={13} className="mt-px shrink-0 text-ink-3" />
                                These are keyword rules in the backend, not a language model. Phrase
                                notes plainly so the intended adjustment is applied. If the adjusted
                                composite falls below 60, the case is rejected automatically.
                            </p>
                        </div>
                    </Panel>

                    <Panel
                        title="Adjustment history"
                        subtitle={
                            noteEvents.length === 0
                                ? 'No field notes recorded'
                                : `${noteEvents.length} submission${noteEvents.length === 1 ? '' : 's'}`
                        }
                        flush
                    >
                        {noteEvents.length === 0 ? (
                            <p className="px-5 py-6 text-center text-2xs text-ink-3">
                                Submitted notes appear here with the resulting composite score.
                            </p>
                        ) : (
                            <ul className="divide-y divide-line">
                                {noteEvents.map((event) => {
                                    const at = parseDate(event.at);
                                    return (
                                        <li key={event.id} className="px-5 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-medium text-ink">
                                                        {fmtScore(event.total_score)} / 100
                                                        {event.delta != null && event.delta !== 0 && (
                                                            <span
                                                                className={
                                                                    'num ml-2 text-2xs font-semibold ' +
                                                                    (event.delta > 0
                                                                        ? 'text-[var(--good-ink)]'
                                                                        : 'text-[var(--critical-ink)]')
                                                                }
                                                            >
                                                                {event.delta > 0 ? '+' : ''}
                                                                {event.delta.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </p>
                                                    {at && (
                                                        <p className="num mt-0.5 font-mono text-2xs text-ink-3">
                                                            {dateOf(at)} · {timeOf(at)}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <Pill status={scoreStatus(event.total_score)} icon={null}>
                                                        {fmtScore(event.total_score)}
                                                    </Pill>
                                                    <Pill status={decisionStatus(event.decision)}>
                                                        {event.decision ?? 'Pending'}
                                                    </Pill>
                                                </div>
                                            </div>
                                            {event.detail?.overrides && event.detail.overrides.length > 0 && (
                                                <ul className="mt-2 space-y-1">
                                                    {event.detail.overrides.map((o) => (
                                                        <li
                                                            key={o}
                                                            className="flex items-start gap-1.5 text-2xs leading-relaxed text-[var(--warning-ink)]"
                                                        >
                                                            <Icon name="alert" size={11} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                                                            {o}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>
        </div>
    );
};

export default PrimaryNotes;
