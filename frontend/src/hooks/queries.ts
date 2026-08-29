/**
 * Server state, owned by TanStack Query.
 *
 * Everything the API returns is cached under a key derived from the case id.
 * Mutations invalidate those keys rather than re-fetching by hand, which is
 * what removed the manual `loadCase` / `Promise.all` / loading-flag blocks the
 * workspace used to carry: a re-score now refreshes the assessment, the
 * document list and the audit trail because they all hang off the same key.
 */

import {
    useMutation, useQuery, useQueryClient, type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../lib/api';
import type {
    Application, ApplicationSummary, Breakeven, CaseDocument, Meta, ScoreEvent,
    SimulationInput,
} from '../types/credit';

export const queryKeys = {
    meta: ['meta'] as const,
    cases: ['cases'] as const,
    case: (id: number) => ['case', id] as const,
    documents: (id: number) => ['case', id, 'documents'] as const,
    events: (id: number) => ['case', id, 'events'] as const,
    breakeven: (id: number) => ['case', id, 'breakeven'] as const,
};

// --- Reads ------------------------------------------------------------------

export function useMeta(): UseQueryResult<Meta> {
    return useQuery({
        queryKey: queryKeys.meta,
        queryFn: api.getMeta,
        // Policy constants change on deploy, not during a session.
        staleTime: Infinity,
    });
}

export function useCases(): UseQueryResult<ApplicationSummary[]> {
    return useQuery({
        queryKey: queryKeys.cases,
        queryFn: async () => (await api.listApplications()).applications,
    });
}

export function useCase(appId: number | null): UseQueryResult<Application> {
    return useQuery({
        queryKey: queryKeys.case(appId ?? 0),
        queryFn: () => api.getAnalysis(appId as number),
        enabled: appId !== null,
    });
}

export function useDocuments(appId: number | null): UseQueryResult<CaseDocument[]> {
    return useQuery({
        queryKey: queryKeys.documents(appId ?? 0),
        queryFn: async () => (await api.getDocuments(appId as number)).documents,
        enabled: appId !== null,
    });
}

export function useEvents(appId: number | null): UseQueryResult<ScoreEvent[]> {
    return useQuery({
        queryKey: queryKeys.events(appId ?? 0),
        queryFn: async () => (await api.getEvents(appId as number)).events,
        enabled: appId !== null,
    });
}

export function useBreakeven(appId: number | null, analysed: boolean): UseQueryResult<Breakeven> {
    return useQuery({
        queryKey: queryKeys.breakeven(appId ?? 0),
        queryFn: () => api.getBreakeven(appId as number),
        enabled: appId !== null && analysed,
    });
}

// --- Mutations --------------------------------------------------------------

/**
 * Anything that re-scores a case invalidates the whole case subtree, because
 * the score, the documents, the break-even distances and the audit trail all
 * move together. Invalidating them individually is how they drift apart.
 */
function useCaseInvalidator(appId: number | null) {
    const queryClient = useQueryClient();
    return () => {
        if (appId !== null) queryClient.invalidateQueries({ queryKey: ['case', appId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.cases });
    };
}

export function useCreateCase() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ companyName, sector }: { companyName: string; sector: string }) =>
            api.createApplication(companyName, sector),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cases }),
    });
}

export function useDeleteCase() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (appId: number) => api.deleteApplication(appId),
        onSuccess: (_data, appId) => {
            queryClient.removeQueries({ queryKey: ['case', appId] });
            queryClient.invalidateQueries({ queryKey: queryKeys.cases });
        },
    });
}

export function useUploadDocuments(appId: number | null) {
    const invalidate = useCaseInvalidator(appId);
    return useMutation({
        mutationFn: (files: File[]) => api.uploadDocuments(appId as number, files),
        onSuccess: invalidate,
    });
}

export function useDeleteDocument(appId: number | null) {
    const invalidate = useCaseInvalidator(appId);
    return useMutation({
        mutationFn: (docId: number) => api.deleteDocument(appId as number, docId),
        onSuccess: invalidate,
    });
}

export function useReanalyze(appId: number | null) {
    const invalidate = useCaseInvalidator(appId);
    return useMutation({
        mutationFn: () => api.reanalyze(appId as number),
        onSuccess: invalidate,
    });
}

export function useUpdateNotes(appId: number | null) {
    const invalidate = useCaseInvalidator(appId);
    return useMutation({
        mutationFn: (input: { capacity: number; notes: string; mgmtQuality: number }) =>
            api.updatePrimaryNotes(appId as number, input.capacity, input.notes, input.mgmtQuality),
        onSuccess: invalidate,
    });
}

export function useGenerateNarrative(appId: number | null) {
    const invalidate = useCaseInvalidator(appId);
    return useMutation({
        mutationFn: () => api.generateNarrative(appId as number),
        onSuccess: invalidate,
    });
}

export function useAskAboutCase(appId: number | null) {
    // Deliberately not cached: the answer is a one-off read of the case, and
    // the case may have been re-scored since the last question.
    return useMutation({
        mutationFn: (question: string) => api.askAboutCase(appId as number, question),
    });
}

/** Simulation never persists, so it is a mutation with nothing to invalidate. */
export function useSimulate(appId: number | null) {
    return useMutation({
        mutationFn: (input: SimulationInput) => api.simulate(appId as number, input),
    });
}
