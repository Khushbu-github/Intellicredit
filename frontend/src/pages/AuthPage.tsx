/**
 * Sign-in and registration.
 *
 * One component serves both modes: the fields and copy differ, the layout and
 * error handling do not, and keeping them together stops the two screens
 * drifting apart visually.
 */

import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import Button from '../components/ui/Button';
import { useAuth } from '../lib/useAuth';

interface Props {
    mode: 'login' | 'register';
}

const MIN_PASSWORD_LENGTH = 8;

const AuthPage: React.FC<Props> = ({ mode }) => {
    const { user, signIn, signUp } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isRegister = mode === 'register';

    // Already signed in: go where they were headed, or the portfolio.
    if (user) {
        const from = (location.state as { from?: string } | null)?.from;
        return <Navigate to={from ?? '/cases'} replace />;
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (isRegister && password.length < MIN_PASSWORD_LENGTH) {
            setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }

        setSubmitting(true);
        try {
            if (isRegister) await signUp(email.trim(), password, fullName.trim() || undefined);
            else await signIn(email.trim(), password);

            const from = (location.state as { from?: string } | null)?.from;
            navigate(from ?? '/cases', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
            <div className="w-full max-w-sm">
                <div className="mb-7 flex flex-col items-center text-center">
                    <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
                        <rect width="32" height="32" rx="7" fill="#0d1626" />
                        <path d="M8 21.5V10.5" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
                        <path
                            d="M13.5 21.5V15M19 21.5V11.8M24.5 21.5V17.5"
                            stroke="#3987e5"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                        />
                    </svg>
                    <h1 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-ink">
                        Intelli<span className="text-[var(--accent-ink)]">Credit</span>
                    </h1>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                        {isRegister
                            ? 'Create an analyst account to start appraising borrowers.'
                            : 'Sign in to your case portfolio.'}
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="rounded-lg border border-line bg-surface p-6 shadow-sm"
                    noValidate
                >
                    {isRegister && (
                        <label className="mb-4 block">
                            <span className="mb-1.5 block text-[13px] font-medium text-ink">
                                Full name <span className="font-normal text-ink-3">(optional)</span>
                            </span>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                autoComplete="name"
                                className="w-full rounded-md border border-line-strong bg-canvas px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-[var(--accent-ink)]"
                            />
                        </label>
                    )}

                    <label className="mb-4 block">
                        <span className="mb-1.5 block text-[13px] font-medium text-ink">Email</span>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="username"
                            className="w-full rounded-md border border-line-strong bg-canvas px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-[var(--accent-ink)]"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-[13px] font-medium text-ink">Password</span>
                        <input
                            type="password"
                            required
                            minLength={isRegister ? MIN_PASSWORD_LENGTH : undefined}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            className="w-full rounded-md border border-line-strong bg-canvas px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-[var(--accent-ink)]"
                        />
                        {isRegister && (
                            <span className="mt-1.5 block text-2xs text-ink-3">
                                At least {MIN_PASSWORD_LENGTH} characters.
                            </span>
                        )}
                    </label>

                    {error && (
                        <p
                            role="alert"
                            className="mt-4 rounded-md border border-[var(--bad-line)] bg-[var(--bad-bg)] px-3 py-2 text-[13px] text-[var(--bad-ink)]"
                        >
                            {error}
                        </p>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        className="mt-5 w-full justify-center"
                        disabled={submitting}
                    >
                        {submitting
                            ? 'Working…'
                            : isRegister
                              ? 'Create account'
                              : 'Sign in'}
                    </Button>
                </form>

                <p className="mt-5 text-center text-[13px] text-ink-2">
                    {isRegister ? 'Already have an account? ' : 'No account yet? '}
                    <Link
                        to={isRegister ? '/login' : '/register'}
                        className="font-medium text-[var(--accent-ink)] hover:underline"
                    >
                        {isRegister ? 'Sign in' : 'Create one'}
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default AuthPage;
