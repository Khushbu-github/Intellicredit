import { createContext, useContext } from 'react';
import type { Status } from '../../lib/scoring';

export interface ToastInput {
    status: Status;
    title: string;
    detail?: string;
}

export const ToastContext = createContext<(t: ToastInput) => void>(() => { });

/** Push a transient notification. Safe to call outside a provider (no-op). */
export const useToast = () => useContext(ToastContext);
