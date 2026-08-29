import { createContext } from 'react';

import type { AuthUser } from './api';

export interface AuthContextValue {
    user: AuthUser | null;
    /** True only while a stored token is being verified, so routes do not flash. */
    initialising: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, fullName?: string) => Promise<void>;
    signOut: () => void;
}

/**
 * Kept apart from the provider component: Vite's fast refresh only works when
 * a module exports components alone, so the context and the hook live here.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);
