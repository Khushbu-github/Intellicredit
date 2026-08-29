/**
 * Analyst Q&A over the open case.
 *
 * The assistant reads the case's own structured data - its score breakdown,
 * gates and flags - and explains the decision the policy engine already made.
 * It cannot re-score anything, and the empty-state prompts are worded to steer
 * analysts toward that kind of question rather than toward asking it to
 * re-underwrite the borrower.
 *
 * The exchange is deliberately not persisted. The audit trail is the case's
 * history; a saved chat transcript would be a second, unreconciled one.
 */

import React, { useRef, useState } from 'react';

import { useAskAboutCase } from '../../hooks/queries';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/Icon';
import Panel from '../ui/Panel';

interface Props {
    appId: number;
    /** False when the deployment has no model configured. */
    available: boolean;
    analysed: boolean;
}

interface Exchange {
    question: string;
    answer: string;
}

const SUGGESTIONS = [
    'Why did this case reach its current decision?',
    'Which constraint is binding on the recommended limit?',
    'Which parts of the score rest on assumptions rather than documents?',
    'What would have to change for this to become bankable?',
];

const CaseAssistant: React.FC<Props> = ({ appId, available, analysed }) => {
    const ask = useAskAboutCase(appId);
    const [question, setQuestion] = useState('');
    const [history, setHistory] = useState<Exchange[]>([]);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const submit = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || ask.isPending) return;

        setError(null);
        try {
            const result = await ask.mutateAsync(trimmed);
            setHistory((previous) => [...previous, { question: trimmed, answer: result.answer }]);
            setQuestion('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The assistant did not respond.');
        }
    };

    if (!available) {
        return (
            <Panel flush>
                <EmptyState
                    icon="chat"
                    title="Case assistant not configured"
                    description="This deployment has no model access, so the assistant is switched off. Everything else in the appraisal — scoring, decisioning and the memo — is unaffected, because none of it depends on a model."
                />
            </Panel>
        );
    }

    if (!analysed) {
        return (
            <Panel flush>
                <EmptyState
                    icon="chat"
                    title="Nothing to discuss yet"
                    description="Ingest the borrower documents first. The assistant answers from the scored case record, so there has to be one."
                />
            </Panel>
        );
    }

    return (
        <div className="space-y-5">
            <div>
                <p className="eyebrow">Step 5 · Interrogate</p>
                <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">
                    Case assistant
                </h1>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                    Ask about this case and get an answer grounded in its own scoring breakdown,
                    policy gates and flag register. The assistant explains the engine's decision —
                    it does not make one.
                </p>
            </div>

            <Panel flush>
                <div className="divide-y divide-line">
                    {history.length === 0 && (
                        <div className="p-5">
                            <p className="mb-3 text-[13px] font-medium text-ink">Try asking</p>
                            <div className="flex flex-wrap gap-2">
                                {SUGGESTIONS.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => submit(suggestion)}
                                        disabled={ask.isPending}
                                        className="rounded-md border border-line-strong px-3 py-1.5 text-left text-2xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {history.map((exchange, index) => (
                        <div key={index} className="space-y-3 p-5">
                            <p className="flex items-start gap-2.5 text-[13px] font-medium text-ink">
                                <Icon name="chat" size={16} className="mt-0.5 shrink-0 text-ink-3" />
                                {exchange.question}
                            </p>
                            <div className="ml-[26px] space-y-2.5">
                                {exchange.answer.split('\n').filter(Boolean).map((para, i) => (
                                    <p key={i} className="text-[13px] leading-relaxed text-ink-2">
                                        {para}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ))}

                    {ask.isPending && (
                        <p className="flex items-center gap-2.5 p-5 text-[13px] text-ink-2">
                            <Icon name="spinner" size={16} className="animate-spin" />
                            Reading the case file…
                        </p>
                    )}

                    {error && (
                        <p
                            role="alert"
                            className="p-5 text-[13px] text-[var(--bad-ink)]"
                        >
                            {error}
                        </p>
                    )}
                </div>
            </Panel>

            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submit(question);
                }}
                className="rounded-lg border border-line bg-surface p-4"
            >
                <label htmlFor="assistant-question" className="sr-only">
                    Ask about this case
                </label>
                <textarea
                    id="assistant-question"
                    ref={inputRef}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                        // Enter sends; Shift+Enter is a newline.
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            submit(question);
                        }
                    }}
                    rows={2}
                    maxLength={1000}
                    placeholder="Ask about this case…"
                    disabled={ask.isPending}
                    className="w-full resize-none bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-2xs text-ink-3">
                        Answers come from this case record only. Not a sanction.
                    </span>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        icon="arrowRight"
                        disabled={!question.trim() || ask.isPending}
                    >
                        Ask
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default CaseAssistant;
