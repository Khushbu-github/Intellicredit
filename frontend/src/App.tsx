/**
 * Route table.
 *
 * This file was a 528-line component holding every piece of case state, all
 * the loaders and the screen switching. Server state now lives in TanStack
 * Query and screen state lives in the URL, so what is left is the routing.
 */

import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import RequireAuth from './components/RequireAuth';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './lib/auth';
import AuthPage from './pages/AuthPage';
import CaseWorkspace from './pages/CaseWorkspace';
import NewCasePage from './pages/NewCasePage';
import PortfolioPage from './pages/PortfolioPage';

const App: React.FC = () => (
    <ToastProvider>
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/register" element={<AuthPage mode="register" />} />

                <Route element={<RequireAuth />}>
                    <Route path="/cases" element={<PortfolioPage />} />
                    <Route path="/cases/new" element={<NewCasePage />} />
                    {/* The tab is part of the URL, so case screens are linkable. */}
                    <Route path="/cases/:appId/:tab" element={<CaseWorkspace />} />
                    <Route
                        path="/cases/:appId"
                        element={<Navigate to="documents" replace />}
                    />
                </Route>

                <Route path="/" element={<Navigate to="/cases" replace />} />
                <Route path="*" element={<Navigate to="/cases" replace />} />
            </Routes>
        </AuthProvider>
    </ToastProvider>
);

export default App;
