/**
 * Route guard.
 *
 * While the stored token is being verified nothing is rendered but a spinner:
 * redirecting during that window would bounce a signed-in analyst to the login
 * page on every refresh.
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../lib/useAuth';

const Spinner: React.FC = () => (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-2.5 text-[13px] text-ink-2">
            <svg
                className="animate-spin"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Loading workspace…
        </div>
    </div>
);

const RequireAuth: React.FC = () => {
    const { user, initialising } = useAuth();
    const location = useLocation();

    if (initialising) return <Spinner />;

    if (!user) {
        // Remember where they were going so the redirect after sign-in lands there.
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    return <Outlet />;
};

export default RequireAuth;
