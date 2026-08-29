import React from 'react';
import Icon from '../ui/Icon';
import { Pill } from '../ui/Status';
import { crore, EMPTY } from '../../lib/format';
import type { Application } from '../../types/credit';

/**
 * How the recommended limit was sized.
 *
 * Three independent methods are computed and the tightest binds. Methods
 * that could not be computed for want of a figure are shown as such rather
 * than silently dropped, so the analyst can see what document would unlock
 * a larger limit.
 */
const LimitWorking: React.FC<{ data: Application }> = ({ data }) => {
    const working = data.limit_working;

    if (!working || working.constraints.length === 0) {
        return <p className="px-5 py-6 text-center text-2xs text-ink-3">No limit sizing was performed.</p>;
    }

    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-left">
                    <thead>
                        <tr className="border-b border-line">
                            <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Method</th>
                            <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Basis</th>
                            <th scope="col" className="eyebrow px-3 py-2.5 font-semibold">Input</th>
                            <th scope="col" className="eyebrow px-5 py-2.5 text-right font-semibold">Limit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {working.constraints.map((c) => (
                            <tr
                                key={c.basis}
                                className={
                                    'border-b border-line last:border-0 align-top ' +
                                    (c.binding ? 'bg-[var(--accent-wash)]' : '')
                                }
                            >
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-medium text-ink">{c.basis}</span>
                                        {c.binding && <Pill status="neutral" icon="check">Binding</Pill>}
                                    </div>
                                </td>
                                <td className="px-3 py-3 text-2xs text-ink-2">{c.formula}</td>
                                <td className="px-3 py-3 text-2xs text-ink-3">{c.input}</td>
                                <td className="num px-5 py-3 text-right text-[13px] font-semibold text-ink">
                                    {c.available && c.value_cr != null ? (
                                        crore(c.value_cr)
                                    ) : (
                                        <span className="text-2xs font-normal text-ink-3">Not computable</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="border-t border-line bg-surface-2 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-2">
                        <Icon name="info" size={13} className="mt-px shrink-0 text-ink-3" />
                        {working.note}
                    </p>
                    <span className="num text-[13px] font-semibold text-ink">
                        {working.recommended_limit_cr != null ? crore(working.recommended_limit_cr) : EMPTY}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default LimitWorking;
