import React from 'react';
import { PILLARS } from '../../lib/scoring';
import { caseRef, crore, dateOf, pct, score as fmtScore, times, EMPTY } from '../../lib/format';
import type { Application } from '../../types/credit';

/**
 * A faithful on-screen rendering of the memo produced by
 * backend/cam/generator.py — same sections in the same order — so the
 * analyst reads the document before downloading it.
 *
 * The page keeps its own light document palette in both themes, because
 * that is what the exported .docx looks like on paper.
 */

const Section: React.FC<{ n: string; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
    <section className="mt-7 first:mt-0">
        <h3 className="border-b border-[#d8d8d8] pb-1.5 font-serif text-[15px] font-semibold text-[#1a1a1a]">
            {n}. {title}
        </h3>
        <div className="mt-3">{children}</div>
    </section>
);

const SubHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="mt-5 font-serif text-[13px] font-semibold text-[#1a1a1a]">{children}</p>
);

const Row: React.FC<{ k: string; v: React.ReactNode; strong?: boolean }> = ({ k, v, strong }) => (
    <div className="flex items-baseline justify-between gap-6 border-b border-[#ededed] py-1 font-serif text-[13px] leading-relaxed last:border-0">
        <dt className={strong ? 'font-semibold text-[#1a1a1a]' : 'text-[#3d3d3d]'}>{k}</dt>
        <dd className={'num shrink-0 text-right text-[#1a1a1a] ' + (strong ? 'font-semibold' : '')}>{v}</dd>
    </div>
);

const Table: React.FC<{ headers: string[]; rows: React.ReactNode[][]; align?: number[] }> = ({
    headers, rows, align = [],
}) => (
    <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse font-sans text-[11px]">
            <thead>
                <tr className="border-b-2 border-[#1a1a1a]">
                    {headers.map((h, i) => (
                        <th
                            key={h}
                            scope="col"
                            className={
                                'py-1.5 pr-3 font-semibold uppercase tracking-[0.04em] text-[#555] ' +
                                (align.includes(i) ? 'text-right' : 'text-left')
                            }
                        >
                            {h}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-[#e8e8e8] align-top">
                        {row.map((cell, ci) => (
                            <td
                                key={ci}
                                className={
                                    'py-1.5 pr-3 leading-relaxed text-[#2a2a2a] ' +
                                    (align.includes(ci) ? 'num text-right' : 'text-left')
                                }
                            >
                                {cell}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const Preview: React.FC<{ appId: number; data: Application | null; companyName: string }> = ({
    appId, data: d, companyName,
}) => {
    const margin = d?.revenue && d?.ebitda ? (d.ebitda / d.revenue) * 100 : null;
    const gates = d?.raw_data?.gates ?? [];
    const flags = d?.red_flags ?? [];
    const constraints = d?.limit_working?.constraints ?? [];
    const benchmark = d?.research?.benchmark;
    const litigation = d?.research?.litigation;
    const mca = d?.research?.mca;
    const covenants = d?.covenants;

    return (
        <div id="cam-print" className="overflow-auto bg-surface-3 p-4 sm:p-8">
            <article className="mx-auto w-full max-w-[760px] bg-white px-8 py-10 shadow-lg sm:px-14 sm:py-14">
                {/* Cover */}
                <header className="border-b-2 border-[#1a1a1a] pb-4">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#666]">
                        Confidential · Internal circulation only
                    </p>
                    <h2 className="mt-2.5 font-serif text-[26px] font-semibold leading-tight text-[#1a1a1a]">
                        Credit Appraisal Memo
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 font-sans text-[11px] text-[#555]">
                        <span>
                            Borrower: <strong className="font-semibold text-[#1a1a1a]">{companyName}</strong>
                        </span>
                        <span className="num">
                            Case: <strong className="font-semibold text-[#1a1a1a]">{caseRef(appId)}</strong>
                        </span>
                        <span>Sector: {d?.sector ?? EMPTY}</span>
                        <span className="num">Prepared: {dateOf(new Date())}</span>
                    </div>
                </header>

                {/* 1. Recommendation */}
                <Section n="1" title="Recommendation">
                    <p className="font-serif text-[20px] font-semibold text-[#1a1a1a]">
                        {d?.decision ?? 'Pending'}
                        {d?.recommended_limit_cr != null && (
                            <span className="ml-3">{crore(d.recommended_limit_cr)}</span>
                        )}
                    </p>
                    <p className="mt-2 font-serif text-[13px] leading-relaxed text-[#3d3d3d]">
                        {d?.decision_reason ?? 'Not yet decisioned.'}
                    </p>

                    <dl className="mt-4">
                        <Row k="Recommended limit" v={d?.recommended_limit_cr != null ? crore(d.recommended_limit_cr) : EMPTY} />
                        <Row k="Pricing" v={d?.spread && d.spread !== 'Not priced' ? d.spread : EMPTY} />
                        <Row k="Composite score" v={`${fmtScore(d?.total_score)} / 100`} strong />
                        <Row k="Internal risk grade" v={d?.risk_grade ?? EMPTY} />
                        <Row k="Existing exposure" v={d?.existing_limits != null ? crore(d.existing_limits) : EMPTY} />
                    </dl>

                    {gates.length > 0 && (
                        <>
                            <SubHeading>1.1 Policy gates</SubHeading>
                            <Table
                                headers={['Gate', 'Result', 'Assessment']}
                                rows={gates.map((g) => [
                                    g.title,
                                    <strong key="r">{g.breached ? 'BREACH' : 'Pass'}</strong>,
                                    g.detail,
                                ])}
                            />
                        </>
                    )}
                </Section>

                {/* 2. Financial position */}
                <Section n="2" title="Financial position">
                    <dl>
                        <Row k="Revenue (annual)" v={d?.revenue != null ? crore(d.revenue) : EMPTY} />
                        <Row k="EBITDA" v={d?.ebitda != null ? crore(d.ebitda) : EMPTY} />
                        <Row k="EBITDA margin" v={margin != null ? pct(margin) : EMPTY} />
                        <Row k="Debt service coverage" v={d?.dscr != null ? times(d.dscr) : EMPTY} />
                        <Row k="Interest coverage" v={d?.interest_coverage != null ? times(d.interest_coverage) : EMPTY} />
                        <Row k="Debt / equity" v={d?.debt_equity != null ? times(d.debt_equity) : EMPTY} />
                        <Row k="Net worth" v={d?.net_worth != null ? crore(d.net_worth) : EMPTY} />
                        <Row k="Promoter holding" v={d?.promoter_stake != null ? pct(d.promoter_stake * 100) : EMPTY} />
                        <Row k="Promoter pledge" v={d?.promoter_pledge != null ? pct(d.promoter_pledge * 100) : EMPTY} />
                        <Row k="Security cover" v={d?.security_cover != null ? times(d.security_cover) : EMPTY} />
                        <Row k="CIBIL commercial" v={d?.cibil_score ?? EMPTY} />
                        <Row
                            k="External rating"
                            v={d?.external_rating ? `${d.external_rating}${d.rating_outlook ? ` / ${d.rating_outlook}` : ''}` : EMPTY}
                        />
                    </dl>
                    <p className="mt-2 font-sans text-[10px] italic text-[#777]">
                        A dash indicates the figure was not present in the documents on file.
                    </p>

                    {benchmark && benchmark.comparisons.length > 0 && (
                        <>
                            <SubHeading>2.1 Peer comparison</SubHeading>
                            <Table
                                headers={['Metric', 'Borrower', 'Sector median', 'Assessment']}
                                align={[1, 2]}
                                rows={benchmark.comparisons.map((c) => [
                                    c.metric,
                                    c.available ? `${c.actual}${c.unit}` : EMPTY,
                                    `${c.peer_median}${c.unit}`,
                                    c.verdict,
                                ])}
                            />
                            <p className="mt-1.5 font-sans text-[10px] italic text-[#777]">{benchmark.source}</p>
                        </>
                    )}
                </Section>

                {/* 3. 5Cs scoring */}
                <Section n="3" title="5Cs scoring">
                    <Table
                        headers={['Pillar', 'Score', 'Weight', 'Utilisation']}
                        align={[1, 2, 3]}
                        rows={[
                            ...PILLARS.map((p) => {
                                const s = d?.[`${p.key}_score`] as number | null | undefined;
                                return [
                                    p.label,
                                    fmtScore(s),
                                    String(p.weight),
                                    s != null ? pct((s / p.weight) * 100, 0) : EMPTY,
                                ];
                            }),
                            [
                                <strong key="t">TOTAL</strong>,
                                <strong key="s">{fmtScore(d?.total_score)}</strong>,
                                <strong key="w">100</strong>,
                                <strong key="u">{d?.total_score != null ? pct(d.total_score, 0) : EMPTY}</strong>,
                            ],
                        ]}
                    />

                    {d?.score_breakdown && (
                        <>
                            <SubHeading>3.1 Scoring working</SubHeading>
                            {PILLARS.map((p) => {
                                const pillar = d.score_breakdown?.[p.key];
                                if (!pillar) return null;
                                return (
                                    <div key={p.key} className="mt-3">
                                        <p className="font-serif text-[12px] font-semibold text-[#1a1a1a]">
                                            {p.label} — {pillar.score.toFixed(1)} of {pillar.weight}
                                        </p>
                                        <p className="font-sans text-[10px] italic text-[#777]">{pillar.intent}</p>
                                        <Table
                                            headers={['Component', 'Points', 'Evidence']}
                                            align={[1]}
                                            rows={pillar.components.map((c) => [
                                                c.label,
                                                `${c.points.toFixed(1)} / ${c.max}`,
                                                c.evidenced ? c.basis : `${c.basis} [assumed — no evidence on file]`,
                                            ])}
                                        />
                                    </div>
                                );
                            })}
                            {d.raw_data?.evidence_coverage != null && (
                                <p className="mt-3 font-sans text-[10px] italic leading-relaxed text-[#777]">
                                    Evidence coverage {d.raw_data.evidence_coverage.toFixed(0)}%: the share of
                                    scoring components backed by a figure actually found in the case file.
                                    Components without evidence are scored at half their maximum and marked above.
                                </p>
                            )}
                        </>
                    )}
                </Section>

                {/* 4. Risk register */}
                <Section n="4" title="Risk register">
                    {flags.length > 0 ? (
                        <Table
                            headers={['Severity', 'Finding', 'Detail']}
                            rows={flags.map((f) => [f.severity.toUpperCase(), f.title, f.detail])}
                        />
                    ) : (
                        <p className="font-serif text-[13px] text-[#3d3d3d]">
                            No screening exceptions were raised against this case.
                        </p>
                    )}

                    <SubHeading>4.1 Screening measurements</SubHeading>
                    <dl>
                        <Row k="Circular trading overlap" v={pct(d?.gst_circular_trading_pct ?? 0)} />
                        <Row
                            k="Turnover mismatch (ITR vs GST)"
                            v={d?.gst_turnover_mismatch_pct != null ? pct(d.gst_turnover_mismatch_pct) : EMPTY}
                        />
                        <Row k="Litigation matters" v={String(d?.litigation_count ?? 0)} />
                        <Row k="Dishonoured instruments" v={String(d?.bounce_count ?? 0)} />
                        <Row k="Related-party dealings" v={d?.related_party_flag ? 'Yes' : 'None noted'} />
                    </dl>

                    {litigation && litigation.cases.length > 0 && (
                        <>
                            <SubHeading>4.2 Litigation detail</SubHeading>
                            <Table
                                headers={['Case', 'Nature', 'Forum', 'Amount', 'Status']}
                                align={[3]}
                                rows={litigation.cases.map((c) => [
                                    c.case_no, c.nature, c.jurisdiction, crore(c.amount_cr), c.status,
                                ])}
                            />
                            <p className="mt-1.5 font-sans text-[10px] italic text-[#777]">{litigation.source}</p>
                        </>
                    )}

                    {mca && mca.directors.length > 0 && (
                        <>
                            <SubHeading>4.3 Directors and charges</SubHeading>
                            <Table
                                headers={['Director', 'DIN', 'Appointed', 'Status']}
                                rows={mca.directors.map((dir) => [
                                    dir.name, dir.din, dir.appointed,
                                    dir.disqualified ? 'DISQUALIFIED' : 'Active',
                                ])}
                            />
                            <p className="mt-1.5 font-sans text-[10px] italic text-[#777]">{mca.source}</p>
                        </>
                    )}
                </Section>

                {/* 5. Limit assessment */}
                <Section n="5" title="Limit assessment">
                    {constraints.length > 0 ? (
                        <>
                            <Table
                                headers={['Method', 'Basis', 'Input', 'Limit', 'Binding']}
                                align={[3]}
                                rows={constraints.map((c) => [
                                    c.basis, c.formula, c.input,
                                    c.available && c.value_cr != null ? crore(c.value_cr) : 'Not computable',
                                    c.binding ? 'YES' : '',
                                ])}
                            />
                            <p className="mt-2 font-serif text-[13px] leading-relaxed text-[#3d3d3d]">
                                {d?.limit_working?.note}
                            </p>
                        </>
                    ) : (
                        <p className="font-serif text-[13px] text-[#3d3d3d]">No limit sizing was performed.</p>
                    )}
                </Section>

                {/* 6. Covenants */}
                {covenants && (
                    <Section n="6" title="Covenants and conditions">
                        {covenants.financial_covenants.length > 0 && (
                            <>
                                <SubHeading>6.1 Financial covenants</SubHeading>
                                <Table
                                    headers={['Covenant', 'Threshold', 'Rationale']}
                                    rows={covenants.financial_covenants.map((c) => [c.covenant, c.threshold, c.reason])}
                                />
                            </>
                        )}
                        {covenants.conditions_precedent.length > 0 && (
                            <>
                                <SubHeading>6.2 Conditions precedent</SubHeading>
                                <Table
                                    headers={['Condition', 'Rationale']}
                                    rows={covenants.conditions_precedent.map((c) => [c.condition, c.reason])}
                                />
                            </>
                        )}
                        {covenants.monitoring.length > 0 && (
                            <>
                                <SubHeading>6.3 Ongoing monitoring</SubHeading>
                                <Table
                                    headers={['Requirement', 'Frequency']}
                                    rows={covenants.monitoring.map((m) => [m.item, m.frequency])}
                                />
                            </>
                        )}
                    </Section>
                )}

                {/* 7. Field notes */}
                {(d?.factory_capacity != null || d?.qualitative_notes) && (
                    <Section n="7" title="Relationship manager assessment">
                        <dl>
                            <Row
                                k="Observed capacity utilisation"
                                v={d?.factory_capacity != null ? pct(d.factory_capacity * 100, 0) : EMPTY}
                            />
                            <Row k="Management quality" v={d?.mgmt_quality ? `${d.mgmt_quality} of 5` : EMPTY} />
                        </dl>
                        {d?.qualitative_notes && (
                            <p className="mt-3 font-serif text-[13px] leading-relaxed text-[#3d3d3d]">
                                {d.qualitative_notes}
                            </p>
                        )}
                    </Section>
                )}

                <footer className="mt-10 border-t border-[#d8d8d8] pt-4 font-sans text-[10px] leading-relaxed text-[#777]">
                    Generated by IntelliCredit from the documents on file. Scoring and decisioning are
                    rules-based and deterministic. Registry, litigation, news and peer-benchmark inputs
                    are simulated in this build and are not verified third-party data. This memo is a
                    decision aid and does not constitute a sanction.
                </footer>
            </article>
        </div>
    );
};

export default Preview;
