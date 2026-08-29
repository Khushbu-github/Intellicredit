/**
 * The model-drafted narrative sections of the memo.
 *
 * Drafting is an explicit action rather than something that happens on every
 * re-score: it costs a model call, and the analyst should decide when the case
 * is settled enough to write up. Once generated it is stored on the case and
 * rendered into the downloaded .docx.
 */

import React from 'react';

import type { CamNarrative } from '../../types/credit';
import { useGenerateNarrative } from '../../hooks/queries';
import Button from '../ui/Button';
import Panel from '../ui/Panel';
import { useToast } from '../ui/toastContext';

interface Props {
    appId: number;
    narrative: CamNarrative | null;
    /** False when the deployment has no model configured. */
    available: boolean;
}

const SECTIONS: Array<{ key: keyof CamNarrative; title: string }> = [
    { key: 'executive_summary', title: 'Executive summary' },
    { key: 'risk_commentary', title: 'Risk commentary' },
    { key: 'mitigants', title: 'Mitigants' },
    { key: 'recommendation_note', title: 'Note to the sanctioning authority' },
];

const NarrativePanel: React.FC<Props> = ({ appId, narrative, available }) => {
    const generate = useGenerateNarrative(appId);
    const toast = useToast();

    if (!available) return null;

    const handleGenerate = async () => {
        try {
            await generate.mutateAsync();
            toast({
                status: 'good',
                title: narrative ? 'Narrative redrafted' : 'Narrative drafted',
                detail: 'It is now included in the downloaded memo.',
            });
        } catch (err) {
            toast({
                status: 'critical',
                title: 'Could not draft the narrative',
                detail: err instanceof Error ? err.message : 'The drafting service did not respond.',
            });
        }
    };

    return (
        <Panel
            title="Drafted narrative"
            subtitle="Written around the figures the policy engine already fixed"
            flush
            actions={
                <Button
                    variant={narrative ? 'ghost' : 'primary'}
                    size="sm"
                    icon="sparkle"
                    onClick={handleGenerate}
                    loading={generate.isPending}
                    disabled={generate.isPending}
                >
                    {generate.isPending ? 'Drafting…' : narrative ? 'Redraft' : 'Draft narrative'}
                </Button>
            }
        >
            {!narrative ? (
                <div className="p-5">
                    <p className="max-w-2xl text-[13px] leading-relaxed text-ink-2">
                        The memo currently uses its template prose. Drafting produces the executive
                        summary, risk commentary and mitigants from this case's scoring output — the
                        recommendation, score, limit and covenants stay exactly as the engine
                        computed them, and the draft may not restate or contradict a figure.
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-line">
                    {SECTIONS.map(({ key, title }) => {
                        const body = narrative[key];
                        if (!body) return null;
                        return (
                            <section key={String(key)} className="p-5">
                                <h3 className="mb-2.5 text-[13px] font-semibold text-ink">{title}</h3>
                                <div className="space-y-2.5">
                                    {String(body).split('\n').filter(Boolean).map((para, i) => (
                                        <p key={i} className="text-[13px] leading-relaxed text-ink-2">
                                            {para}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                    <p className="px-5 py-3 text-2xs text-ink-3">
                        Drafted by {narrative.generated_by}. The recommendation, score, limit and
                        covenants are computed deterministically and are not model output.
                    </p>
                </div>
            )}
        </Panel>
    );
};

export default NarrativePanel;
