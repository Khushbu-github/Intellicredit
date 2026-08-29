import React, { useCallback, useState } from 'react';
import Icon from './Icon';
import { STATUS_ICON, STATUS_MARK } from './statusTokens';
import { ToastContext, type ToastInput } from './toastContext';

interface ToastItem extends ToastInput {
    id: number;
}

const LIFETIME_MS = 6000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [items, setItems] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: number) => {
        setItems((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const push = useCallback(
        (t: ToastInput) => {
            const id = Date.now() + Math.random();
            setItems((prev) => [...prev, { ...t, id }]);
            window.setTimeout(() => dismiss(id), LIFETIME_MS);
        },
        [dismiss],
    );

    return (
        <ToastContext.Provider value={push}>
            {children}
            <div
                aria-live="polite"
                className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-2"
            >
                {items.map((t) => (
                    <div
                        key={t.id}
                        className="pointer-events-auto flex animate-slide-in items-start gap-3 rounded-md border border-line bg-surface p-3.5 shadow-pop"
                    >
                        <span
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: STATUS_MARK[t.status] }}
                        >
                            <Icon name={STATUS_ICON[t.status]} size={12} strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-ink">{t.title}</p>
                            {t.detail && <p className="mt-0.5 text-2xs leading-relaxed text-ink-2">{t.detail}</p>}
                        </div>
                        <button
                            type="button"
                            onClick={() => dismiss(t.id)}
                            aria-label="Dismiss notification"
                            className="shrink-0 rounded p-1 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                        >
                            <Icon name="close" size={13} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export default ToastProvider;
