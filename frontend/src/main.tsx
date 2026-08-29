import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';
import { UnauthorizedError } from './lib/api';
import './index.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Case data changes only when this analyst acts on it, and every
            // mutation invalidates what it touched - so a window refocus does
            // not need to re-fetch the whole workspace.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: (failureCount, error) => {
                // An expired session will not fix itself by retrying.
                if (error instanceof UnauthorizedError) return false;
                return failureCount < 2;
            },
        },
        mutations: { retry: false },
    },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
);
