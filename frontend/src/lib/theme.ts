import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'ic.theme';

function systemTheme(): Theme {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function stored(): Theme | null {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'dark' || v === 'light' ? v : null;
    } catch {
        return null;
    }
}

/**
 * Theme state. Until the user picks a side we follow the OS; the first
 * toggle writes an explicit stamp on <html> that wins in both directions.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
    const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme());

    useEffect(() => {
        if (stored()) document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
            if (!stored()) setTheme(mq.matches ? 'dark' : 'light');
        };
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const toggle = useCallback(() => {
        setTheme((prev) => {
            const next: Theme = prev === 'dark' ? 'light' : 'dark';
            try {
                localStorage.setItem(KEY, next);
            } catch {
                /* private browsing — the stamp below still applies for this session */
            }
            document.documentElement.setAttribute('data-theme', next);
            return next;
        });
    }, []);

    return { theme, toggle };
}
