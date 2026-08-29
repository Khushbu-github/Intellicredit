/**
 * Authentication state.
 *
 * The token lives in localStorage so a refresh does not sign the analyst out.
 * On boot the stored token is verified against /auth/me rather than trusted:
 * a token that has expired, or was signed with a key the server has since
 * rotated, must not leave the UI showing a signed-in shell it cannot populate.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, getToken, setToken, type AuthUser } from './api';
import { AuthContext } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);

    // Seeded from whether there is anything to verify, so the effect never has
    // to flip this synchronously on the no-token path.
    const [initialising, setInitialising] = useState(() => getToken() !== null);

    const queryClient = useQueryClient();

    useEffect(() => {
        if (!getToken()) return;

        let cancelled = false;

        api.me()
            .then((me) => !cancelled && setUser(me))
            .catch(() => {
                setToken(null);
                if (!cancelled) setUser(null);
            })
            .finally(() => !cancelled && setInitialising(false));

        return () => {
            cancelled = true;
        };
    }, []);

    const signOut = useCallback(() => {
        setToken(null);
        setUser(null);
        // Any case data already fetched belongs to the analyst signing out.
        queryClient.clear();
    }, [queryClient]);

    const signIn = useCallback(async (email: string, password: string) => {
        const result = await api.login(email, password);
        setToken(result.access_token);
        setUser(result.user);
    }, []);

    const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
        const result = await api.register(email, password, fullName);
        setToken(result.access_token);
        setUser(result.user);
    }, []);

    const value = useMemo(
        () => ({ user, initialising, signIn, signUp, signOut }),
        [user, initialising, signIn, signUp, signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
