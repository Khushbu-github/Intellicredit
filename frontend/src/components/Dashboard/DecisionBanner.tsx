import React from 'react';
import Icon from '../ui/Icon';
import { Pill } from '../ui/Status';
import { crore, score as fmtScore } from '../../lib/format';
import { POLICY, decisionStatus } from '../../lib/scoring';
import { STATUS_MARK } from '../ui/statusTokens';
import type { Application } from '../../types/credit';

/**
 * The sanctioning verdict.
 *
 * The status hue sits on the surface and the left rule; the verdict itself
 * is spelled out in ink beside an icon, so the outcome is never carried by
 * colour alone.
 */
const DecisionBanner: React.FC<{ data: Application }> = ({ data }) => {
    const decision = data.decision ?? null;
    const status = decisionStatus(decision);
    const pending = !decision;

    const wash = pending
        ? 'var(--surface-2)'
        : decision === 'REJECT'
            ? 'var(--critical-wash)'
            : decision === 'REFER'
                ? 'var(--warning-wash)'
                : 'var(--good-wash)';
    const mark = pending ? 'var(--ink-3)' : STATUS_MARK[status];

    const gates = data.raw_data?.gates ?? [];
    const breached = gates.filter((g) => g.breached && g.severity === 'critical');
    const passed = gates.length - gates.filter((g) => g.breached).length;

    const heading = pending
        ? 'Not yet decisioned'
        : decision === 'REJECT'
            ? 'Reject'
            : decision === 'REFER'
                ? 'Refer'
                : 'Approve';

    return (
        <section
            className="overflow-hidden rounded-lg border border-line"
            style={{ backgroundColor: wash }}
            aria-label="Sanctioning decision"
        >
            <div
                className="flex flex-col gap-5 border-l-[3px] p-5 lg:flex-row lg:items-center lg:gap-8"
                style={{ borderLeftColor: mark }}
            >
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
                        style={{ backgroundColor: mark }}
                    >
                        <Icon
                            name={decision === 'REJECT' ? 'alert' : pending ? 'info' : decision === 'REFER' ? 'info' : 'check'}
                            size={18}
                            strokeWidth={2.2}
                        />
                    </span>

                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">{heading}</h1>
                            {data.risk_grade && <Pill status="neutral" icon={null}>{data.risk_grade}</Pill>}
                            {gates.length > 0 && (
                                <Pill status={breached.length > 0 ? 'critical' : 'good'}>
                                    {breached.length > 0
                                        ? `${breached.length} of ${gates.length} gates breached`
                                        : `All ${gates.length} gates cleared`}
                                </Pill>
                            )}
                        </div>
                        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-2">
                            {data.decision_reason ?? 'Upload the borrower documents to produce a recommendation.'}
                        </p>
                        {gates.length > 0 && (
                            <p className="num mt-1.5 text-2xs text-ink-3">
                                {passed} passed · {gates.length - passed} breached
                            </p>
                        )}
                    </div>
                </div>

                <dl className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line lg:min-w-[440px]">
                    <div className="bg-surface px-4 py-3">
                        <dt className="eyebrow">Recommended limit</dt>
                        <dd className="figure mt-1.5 text-[17px]">
                            {data.recommended_limit_cr != null ? crore(data.recommended_limit_cr) : '—'}
                        </dd>
                        {data.limit_working?.binding_constraint && (
                            <dd className="mt-0.5 text-2xs text-ink-3">
                                {data.limit_working.binding_constraint}
                            </dd>
                        )}
                    </div>
                    <div className="bg-surface px-4 py-3">
                        <dt className="eyebrow">Pricing</dt>
                        <dd className="mt-1.5 text-[13px] font-semibold text-ink">
                            {data.spread && data.spread !== 'Not priced' ? data.spread : 'Not priced'}
                        </dd>
                        {data.raw_data?.pricing?.band && data.raw_data.pricing.band !== 'N/A' && (
                            <dd className="mt-0.5 text-2xs text-ink-3">{data.raw_data.pricing.band} band</dd>
                        )}
                    </div>
                    <div className="bg-surface px-4 py-3">
                        <dt className="eyebrow">Composite</dt>
                        <dd className="figure mt-1.5 text-[17px]">
                            {fmtScore(data.total_score)}
                            <span className="ml-1 text-[12px] font-medium text-ink-3">/ 100</span>
                        </dd>
                        <dd className="mt-0.5 text-2xs text-ink-3">Cut-off {POLICY.minTotalScore}</dd>
                    </div>
                </dl>
            </div>
        </section>
    );
};

export default DecisionBanner;
