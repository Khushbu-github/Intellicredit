import React, { useState } from 'react';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Meter from '../ui/Meter';
import EmptyState from '../ui/EmptyState';
import { Dot, Pill, Tag } from '../ui/Status';
import { useToast } from '../ui/toastContext';
import { POLICY, decisionStatus, scoreStatus } from '../../lib/scoring';
import { crore, score as fmtScore, EMPTY } from '../../lib/format';
import type { Application, Breakeven, SimulationInput, SimulationResult } from '../../types/credit';

interface SimulatorProps {
    data: Application | null;
    breakeven: Breakeven | null;
    onSimulate: (input: SimulationInput) => Promise<SimulationResult>;
}

interface Lever {
    key: keyof SimulationInput;
    label: string;
    hint: string;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
}

const LEVERS: Lever[] = [
    {
        key: 'dscr', label: 'Debt service coverage', hint: `Policy floor ${POLICY.minDscr.toFixed(2)}x`,
        min: 0.5, max: 3, step: 0.05, format: (v) => `${v.toFixed(2)}x`,
    },
    {
        key: 'revenue', label: 'Annual revenue', hint: 'Drives the turnover-method limit',
        min: 0, max: 500, step: 5, format: (v) => `₹${v.toFixed(0)} Cr`,
    },
    {
        key: 'ebitda', label: 'EBITDA', hint: 'Drives the cash-flow-method limit',
        min: 0, max: 150, step: 1, format: (v) => `₹${v.toFixed(0)} Cr`,
    },
    {
        key: 'collateral_value', label: 'Security offered', hint: 'Drives the collateral-method limit',
        min: 0, max: 200, step: 5, format: (v) => `₹${v.toFixed(0)} Cr`,
    },
    {
        key: 'litigation_count', label: 'Litigation matters', hint: `Reject at ${POLICY.maxLitigation}`,
        min: 0, max: 8, step: 1, format: (v) => String(v),
    },
    {
        key: 'promoter_stake', label: 'Promoter holding', hint: 'Comfort above 30%',
        min: 0, max: 1, step: 0.05, format: (v) => `${(v * 100).toFixed(0)}%`,
    },
    {
        key: 'cibil_score', label: 'CIBIL commercial', hint: 'Bureau score out of 900',
        min: 300, max: 900, step: 10, format: (v) => String(Math.round(v)),
    },
    {
        key: 'factory_capacity', label: 'Capacity utilisation', hint: 'Observed on site',
        min: 0, max: 1, step: 0.05, format: (v) => `${(v * 100).toFixed(0)}%`,
    },
];

/** Current value of a lever on the live case, used as the slider's starting point. */
function baselineFor(key: keyof SimulationInput, data: Application): number {
    switch (key) {
        case 'dscr': return data.dscr ?? 1;
        case 'revenue': return data.revenue ?? 0;
        case 'ebitda': return data.ebitda ?? 0;
        case 'collateral_value': return data.collateral_value ?? 0;
        case 'litigation_count': return data.litigation_count ?? 0;
        case 'promoter_stake': return data.promoter_stake ?? 0;
        case 'cibil_score': return data.cibil_score ?? 700;
        case 'factory_capacity': return data.factory_capacity ?? 1;
        default: return 0;
    }
}

/**
 * What-if analysis. Answers the question a credit committee always asks -
 * what would have to change for this to be bankable - by re-running the
 * live decision engine against overridden inputs. Nothing is persisted.
 */
const Simulator: React.FC<SimulatorProps> = ({ data, breakeven, onSimulate }) => {
    const [overrides, setOverrides] = useState<Partial<Record<keyof SimulationInput, number>>>({});
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [busy, setBusy] = useState(false);
    const toast = useToast();

    if (!data || data.total_score == null) {
        return (
            <div className="space-y-5">
                <div>
                    <p className="eyebrow">Step 4 · Sensitivity</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">What-if analysis</h1>
                </div>
                <Panel flush>
                    <EmptyState
                        icon="scales"
                        title="Analyse the case first"
                        description="Sensitivity analysis re-runs the decision engine against the scored case, so the case needs a baseline before it can be flexed."
                    />
                </Panel>
            </div>
        );
    }

    const activeCount = Object.keys(overrides).length;

    const run = async () => {
        setBusy(true);
        try {
            const outcome = await onSimulate(overrides as SimulationInput);
            setResult(outcome);
            if (outcome.decision !== data.decision) {
                toast({
                    status: outcome.decision === 'APPROVE' ? 'good' : 'warning',
                    title: `Decision would change to ${outcome.decision}`,
                    detail: outcome.reason.slice(0, 140),
                });
            }
        } catch (err) {
            toast({
                status: 'critical',
                title: 'Simulation failed',
                detail: err instanceof Error ? err.message : 'The appraisal service did not respond.',
            });
        } finally {
            setBusy(false);
        }
    };

    const reset = () => {
        setOverrides({});
        setResult(null);
    };

    const simulatedTotal = result ? Number(result.scores.total) : null;
    const delta = result?.delta.total_score ?? 0;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow">Step 4 · Sensitivity</p>
                    <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">What-if analysis</h1>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                        Flex the inputs to see what would have to change for the recommendation to
                        move. Runs against the live decision engine and persists nothing.
                    </p>
                </div>
                <Tag>Read-only · case is not modified</Tag>
            </div>

            {/* Distance to each gate */}
            {breakeven && (
                <Panel title="Distance to policy" subtitle="What each gate needs" flush>
                    <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        {[
                            {
                                label: 'Composite score', ...breakeven.score,
                                fmt: (v: number | null) => (v == null ? EMPTY : String(Math.round(v * 10) / 10)),
                            },
                            {
                                label: 'Debt service coverage', ...breakeven.dscr,
                                fmt: (v: number | null) => (v == null ? EMPTY : `${v.toFixed(2)}x`),
                            },
                            {
                                label: 'Litigation matters', ...breakeven.litigation,
                                fmt: (v: number | null) => (v == null ? EMPTY : String(v)),
                            },
                        ].map((gate) => (
                            <div key={gate.label} className="p-5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="eyebrow">{gate.label}</p>
                                    <Pill status={gate.cleared ? 'good' : 'critical'}>
                                        {gate.cleared ? 'Cleared' : 'Short'}
                                    </Pill>
                                </div>
                                <p className="figure mt-2 text-[22px] leading-none">{gate.fmt(gate.current)}</p>
                                <p className="mt-2 text-2xs leading-relaxed text-ink-2">
                                    {gate.cleared
                                        ? `Ahead of the required ${gate.fmt(gate.required)}.`
                                        : `Needs ${gate.fmt(gate.required)} — a gap of ${gate.gap == null ? EMPTY : Math.abs(gate.gap).toFixed(2)}.`}
                                </p>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                {/* Levers */}
                <Panel
                    title="Inputs"
                    subtitle={activeCount ? `${activeCount} overridden` : 'Baseline — nothing overridden'}
                    actions={
                        activeCount > 0 && (
                            <Button variant="ghost" size="sm" icon="refresh" onClick={reset}>
                                Reset
                            </Button>
                        )
                    }
                >
                    <div className="space-y-5">
                        {LEVERS.map((lever) => {
                            const base = baselineFor(lever.key, data);
                            const value = overrides[lever.key] ?? base;
                            const changed = overrides[lever.key] !== undefined;

                            return (
                                <div key={lever.key}>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <label htmlFor={`lever-${lever.key}`} className="text-[13px] font-medium text-ink">
                                            {lever.label}
                                        </label>
                                        <div className="flex items-baseline gap-2">
                                            {changed && (
                                                <span className="num text-2xs text-ink-3 line-through">
                                                    {lever.format(base)}
                                                </span>
                                            )}
                                            <span
                                                className={
                                                    'num text-[13px] font-semibold ' +
                                                    (changed ? 'text-[var(--accent-ink)]' : 'text-ink')
                                                }
                                            >
                                                {lever.format(value)}
                                            </span>
                                        </div>
                                    </div>
                                    <input
                                        id={`lever-${lever.key}`}
                                        type="range"
                                        min={lever.min}
                                        max={lever.max}
                                        step={lever.step}
                                        value={value}
                                        onChange={(e) =>
                                            setOverrides((prev) => ({
                                                ...prev,
                                                [lever.key]: Number.parseFloat(e.target.value),
                                            }))
                                        }
                                        className="mt-2.5 w-full"
                                    />
                                    <p className="mt-1 text-2xs text-ink-3">{lever.hint}</p>
                                </div>
                            );
                        })}

                        <Button
                            variant="primary"
                            size="lg"
                            block
                            icon="scales"
                            loading={busy}
                            disabled={activeCount === 0}
                            onClick={run}
                        >
                            {busy ? 'Running…' : activeCount === 0 ? 'Move an input to simulate' : 'Run simulation'}
                        </Button>
                    </div>
                </Panel>

                {/* Outcome */}
                <div className="space-y-5">
                    <Panel title="Outcome" subtitle={result ? 'Simulated against the live engine' : 'Not yet run'} flush>
                        {!result ? (
                            <EmptyState
                                icon="gauge"
                                title="No simulation yet"
                                description="Adjust one or more inputs, then run the simulation to see the resulting decision."
                            />
                        ) : (
                            <div>
                                {/* Baseline vs simulated */}
                                <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                                    <div className="p-5">
                                        <p className="eyebrow">Current</p>
                                        <p className="figure mt-2 text-[24px] leading-none">
                                            {fmtScore(result.baseline.total_score)}
                                        </p>
                                        <div className="mt-2.5">
                                            <Pill status={decisionStatus(result.baseline.decision)}>
                                                {result.baseline.decision ?? 'Pending'}
                                            </Pill>
                                        </div>
                                        <p className="num mt-2 text-2xs text-ink-3">
                                            {result.baseline.recommended_limit_cr != null
                                                ? crore(result.baseline.recommended_limit_cr)
                                                : 'No limit'}
                                        </p>
                                    </div>
                                    <div className="bg-surface-2 p-5">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="eyebrow">Simulated</p>
                                            {delta !== 0 && (
                                                <span
                                                    className={
                                                        'num text-2xs font-semibold ' +
                                                        (delta > 0 ? 'text-[var(--good-ink)]' : 'text-[var(--critical-ink)]')
                                                    }
                                                >
                                                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="figure mt-2 text-[24px] leading-none">
                                            {fmtScore(simulatedTotal)}
                                        </p>
                                        <div className="mt-2.5">
                                            <Pill status={decisionStatus(result.decision)}>{result.decision}</Pill>
                                        </div>
                                        <p className="num mt-2 text-2xs text-ink-3">
                                            {result.recommended_limit_cr != null
                                                ? `${crore(result.recommended_limit_cr)} · ${result.spread}`
                                                : 'No limit'}
                                        </p>
                                    </div>
                                </div>

                                <div className="border-b border-line px-5 py-4">
                                    <Meter
                                        value={simulatedTotal ?? 0}
                                        status={scoreStatus(simulatedTotal)}
                                        threshold={POLICY.minTotalScore}
                                        thresholdLabel={`Cut-off ${POLICY.minTotalScore}`}
                                    />
                                    <p className="mt-2 text-2xs text-ink-3">
                                        Tick marks the {POLICY.minTotalScore}-point sanctioning cut-off.
                                    </p>
                                    <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{result.reason}</p>
                                </div>

                                {/* Gates under the simulated inputs */}
                                <ul className="divide-y divide-line">
                                    {result.gates.map((gate) => (
                                        <li key={gate.code} className="flex items-start gap-2.5 px-5 py-3">
                                            <Dot status={gate.breached ? 'critical' : 'good'} className="mt-[6px]" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[13px] font-medium text-ink">{gate.title}</p>
                                                    <span className="text-2xs font-semibold text-ink-2">
                                                        {gate.breached ? 'Breach' : 'Pass'}
                                                    </span>
                                                </div>
                                                <p className="mt-0.5 text-2xs leading-relaxed text-ink-3">{gate.detail}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </Panel>

                    {result && Object.keys(result.inputs).length > 0 && (
                        <Panel title="Overrides applied" flush>
                            <ul className="divide-y divide-line">
                                {Object.entries(result.inputs).map(([key, value]) => {
                                    const lever = LEVERS.find((l) => l.key === key);
                                    return (
                                        <li key={key} className="flex items-center justify-between gap-3 px-5 py-2.5">
                                            <span className="text-[13px] text-ink-2">{lever?.label ?? key}</span>
                                            <span className="num text-[13px] font-semibold text-ink">
                                                {lever ? lever.format(Number(value)) : String(value)}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="border-t border-line bg-surface-2 px-5 py-3">
                                <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-2">
                                    <Icon name="info" size={13} className="mt-px shrink-0 text-ink-3" />
                                    Simulated figures are not written to the case. To make a change stick,
                                    upload the supporting document or record it in the field notes.
                                </p>
                            </div>
                        </Panel>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Simulator;
