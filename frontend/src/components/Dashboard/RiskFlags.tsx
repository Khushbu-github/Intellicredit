import React from 'react';
import Icon from '../ui/Icon';
import { Dot } from '../ui/Status';
import { riskRegister } from '../../lib/scoring';
import type { Application } from '../../types/credit';

/**
 * The risk register, sorted worst-first. Each row states its measured value,
 * the policy threshold it is measured against, and a written verdict — the
 * status dot is a secondary cue, never the only one.
 */
const RiskFlags: React.FC<{ data: Application }> = ({ data }) => {
    const items = riskRegister(data);

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                    <tr className="border-b border-line">
                        <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Check</th>
                        <th scope="col" className="eyebrow px-3 py-2.5 text-right font-semibold">Observed</th>
                        <th scope="col" className="eyebrow px-5 py-2.5 font-semibold">Assessment</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id} className="border-b border-line last:border-0 align-top">
                            <td className="px-5 py-3.5">
                                <div className="flex items-start gap-2.5">
                                    <Dot status={item.status} className="mt-[7px]" />
                                    <div>
                                        <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                                        <p className="mt-0.5 text-2xs leading-relaxed text-ink-3">{item.detail}</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-3 py-3.5 text-right">
                                <span className="num text-[13px] font-semibold text-ink">{item.value}</span>
                                <p className="num mt-0.5 text-2xs text-ink-3">{item.threshold}</p>
                            </td>
                            <td className="px-5 py-3.5">
                                <span className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-2">
                                    {item.status === 'critical' && (
                                        <Icon
                                            name="alert"
                                            size={12}
                                            strokeWidth={2.1}
                                            className="mt-[3px] shrink-0 text-[var(--status-critical)]"
                                        />
                                    )}
                                    {item.verdict}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default RiskFlags;
