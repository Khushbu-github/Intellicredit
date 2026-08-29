import React from 'react';
import Panel from '../ui/Panel';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { Dot, Pill, Tag } from '../ui/Status';
import { PILLARS, decisionStatus, scoreStatus } from '../../lib/scoring';
import { labelFor } from '../../lib/documents';
import { score as fmtScore, timeOf, dateOf } from '../../lib/format';
import type { Application, CaseDocument, ScoreEvent } from '../../types/credit';

interface ExplainTrailProps {
    data: Application | null;
    documents: CaseDocument[];
    events: ScoreEvent[];
}

const TRIGGER_LABEL: Record<string, string> = {
    ingestion: 'Document ingestion',
    primary_notes: 'Field notes applied',
    reanalysis: 'Re-analysis',
};

const parseDate = (value: string) => {
    const d = new Date(value.endsWith('Z') ? value : `${value}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The audit trail.
 *
 * Every entry here is a server-side ScoreEvent recorded at the moment the
 * case was scored, not a narration reconstructed in the browser - so the
 * timeline reflects what actually happened, including runs from earlier
 * sessions.
 */
const ExplainTrail: React.FC<ExplainTrailProps> = ({ data, documents, events }) => {
    if (!data || !data.decision) {
        return (
            <div className="space-y-5">
                <div>
                    <p className="eyebrow">Step 6 · Audit</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Decision audit trail</h1>
                </div>
                <Panel flush>
                    <EmptyState
                        icon="trail"
                        title="Nothing to audit yet"
                        description="Once the case is scored, every scoring run is recorded here with the gates it applied and the values it acted on."
                    />
                </Panel>
            </div>
        );
    }

    const gates = data.raw_data?.gates ?? [];
    const breached = gates.filter((g) => g.breached && g.severity === 'critical');
    const parsed = documents.filter((d) => d.parse_status === 'parsed');
    const latest = events[0] ?? null;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow">Step 6 · Audit</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Decision audit trail</h1>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                        Every scoring run recorded against this case, with the policy gates each one
                        applied. Scoring is deterministic, so this trail fully reproduces the
                        recommendation.
                    </p>
                </div>
                {latest && parseDate(latest.at) && (
                    <Tag className="font-mono">
                        Last run {timeOf(parseDate(latest.at)!)}
                    </Tag>
                )}
            </div>

            {breached.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-[var(--critical-wash)] px-4 py-3">
                    <Icon name="alert" size={15} className="shrink-0 text-[var(--critical-ink)]" />
                    <span className="text-[13px] font-semibold text-[var(--critical-ink)]">
                        Decisive factor{breached.length === 1 ? '' : 's'}:
                    </span>
                    <span className="text-[13px] text-[var(--critical-ink)] opacity-90">
                        {breached.map((b) => b.title).join(' · ')}
                    </span>
                </div>
            )}

            {/* Policy gates as evaluated on the live case */}
            <Panel title="Policy gates" subtitle={`${gates.length} evaluated`} flush>
                {gates.length === 0 ? (
                    <p className="px-5 py-6 text-center text-2xs text-ink-3">No gates recorded on this run.</p>
                ) : (
                    <ul className="divide-y divide-line">
                        {gates.map((gate) => (
                            <li key={gate.code} className="flex items-start gap-3 px-5 py-3.5">
                                <Dot status={gate.breached ? 'critical' : 'good'} className="mt-[7px]" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <p className="text-[13px] font-semibold text-ink">{gate.title}</p>
                                        <Pill status={gate.breached ? 'critical' : 'good'}>
                                            {gate.breached ? 'Breach' : 'Pass'}
                                        </Pill>
                                    </div>
                                    <p className="mt-0.5 text-2xs leading-relaxed text-ink-2">{gate.detail}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>

            {/* Scoring history */}
            <Panel
                title="Scoring history"
                subtitle={`${events.length} run${events.length === 1 ? '' : 's'} recorded`}
                flush
            >
                {events.length === 0 ? (
                    <p className="px-5 py-6 text-center text-2xs text-ink-3">No scoring runs recorded.</p>
                ) : (
                    <ol className="px-5 py-1">
                        {events.map((event, i) => {
                            const at = parseDate(event.at);
                            const pillars = event.detail?.pillars;
                            return (
                                <li key={event.id} className="relative flex gap-4 py-4">
                                    {i < events.length - 1 && (
                                        <span
                                            className="absolute bottom-[-6px] left-[11px] top-[30px] w-px bg-line"
                                            aria-hidden="true"
                                        />
                                    )}

                                    <span className="relative z-10 mt-1 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface">
                                        <Dot status={decisionStatus(event.decision)} />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-[13px] font-semibold text-ink">
                                                {TRIGGER_LABEL[event.trigger] ?? event.trigger}
                                                {i === 0 && (
                                                    <span className="ml-2 text-2xs font-medium text-[var(--accent-ink)]">
                                                        current
                                                    </span>
                                                )}
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                {event.delta != null && event.delta !== 0 && (
                                                    <span
                                                        className={
                                                            'num text-2xs font-semibold ' +
                                                            (event.delta > 0
                                                                ? 'text-[var(--good-ink)]'
                                                                : 'text-[var(--critical-ink)]')
                                                        }
                                                    >
                                                        {event.delta > 0 ? '+' : ''}
                                                        {event.delta.toFixed(1)}
                                                    </span>
                                                )}
                                                <Pill status={scoreStatus(event.total_score)}>
                                                    {fmtScore(event.total_score)} / 100
                                                </Pill>
                                                <Pill status={decisionStatus(event.decision)}>
                                                    {event.decision ?? 'Pending'}
                                                </Pill>
                                            </div>
                                        </div>

                                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{event.summary}</p>

                                        {at && (
                                            <p className="num mt-1 font-mono text-2xs text-ink-3">
                                                {dateOf(at)} · {timeOf(at)}
                                            </p>
                                        )}

                                        {pillars && (
                                            <ul className="mt-2 flex flex-wrap gap-1.5">
                                                {PILLARS.map((p) => (
                                                    <li
                                                        key={p.key}
                                                        className="num rounded border border-line bg-surface-2 px-2 py-[3px] font-mono text-2xs text-ink-3"
                                                    >
                                                        {p.label} {(pillars[p.key] ?? 0).toFixed(1)}/{p.weight}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

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
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </Panel>

            {/* Evidence base */}
            <Panel
                title="Evidence base"
                subtitle={`${parsed.length} of ${documents.length} document${documents.length === 1 ? '' : 's'} parsed`}
                flush
            >
                {documents.length === 0 ? (
                    <p className="px-5 py-6 text-center text-2xs text-ink-3">No documents on file.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] border-collapse text-left">
                            <thead>
                                <tr className="border-b border-line">
                                    <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">File</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Routed to</th>
                                    <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Status</th>
                                    <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Ingestion result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((d) => (
                                    <tr key={d.id} className="border-b border-line last:border-0 align-top">
                                        <td className="px-5 py-3 font-mono text-2xs text-ink">{d.filename}</td>
                                        <td className="px-3 py-3 text-2xs text-ink-2">
                                            {d.doc_type === 'unclassified' ? 'Unclassified' : labelFor(d.doc_type)}
                                        </td>
                                        <td className="px-3 py-3">
                                            <Pill
                                                status={
                                                    d.parse_status === 'parsed'
                                                        ? 'good'
                                                        : d.parse_status === 'failed'
                                                            ? 'critical'
                                                            : 'warning'
                                                }
                                            >
                                                {d.parse_status}
                                            </Pill>
                                        </td>
                                        <td className="px-5 py-3 text-2xs leading-relaxed text-ink-3">
                                            {d.parse_message ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {data.raw_data?.evidence_coverage != null && (
                    <p className="border-t border-line bg-surface-2 px-5 py-2.5 text-2xs text-ink-3">
                        Evidence coverage{' '}
                        <span className="num font-semibold text-ink-2">
                            {data.raw_data.evidence_coverage.toFixed(0)}%
                        </span>{' '}
                        — the share of scoring components backed by a figure actually found in the case
                        file. Components without evidence score at half their maximum and are marked in
                        the 5Cs breakdown.
                    </p>
                )}
            </Panel>
        </div>
    );
};

export default ExplainTrail;
