/**
 * The typed HTTP client for the appraisal API.
 *
 * One module owns every request, so the bearer token is attached in exactly
 * one place and a 401 is handled the same way everywhere. Components never
 * call fetch directly - they go through the query hooks in hooks/queries.ts,
 * which call this.
 */

import type {
    Application, ApplicationSummary, Breakeven, CamNarrative, CaseDocument, Meta,
    ScoreEvent, SimulationInput, SimulationResult,
} from '../types/credit';

export const BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const TOKEN_KEY = 'ic.token';

/** Raised for a 401, so the auth layer can log the analyst out on sight. */
export class UnauthorizedError extends Error {
    constructor(message = 'Your session has expired. Please sign in again.') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export function getToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null; // private browsing: the session simply will not persist
    }
}

export function setToken(token: string | null): void {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* nothing to persist to */
    }
}

/** Turns a non-2xx response into an Error carrying the server's own detail. */
async function readError(res: Response): Promise<string> {
    let detail = `${res.status} ${res.statusText}`;
    try {
        const body = await res.json();
        if (body?.detail) {
            detail =
                typeof body.detail === 'string'
                    ? body.detail
                    // FastAPI validation errors arrive as a list of field problems.
                    : Array.isArray(body.detail)
                      ? body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ')
                      : JSON.stringify(body.detail);
        }
    } catch {
        const text = await res.text().catch(() => '');
        if (text) detail = text.slice(0, 300);
    }
    return detail;
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

    if (res.status === 401) {
        setToken(null);
        throw new UnauthorizedError();
    }
    if (!res.ok) throw new Error(await readError(res));
    return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    return (await raw(path, init)).json() as Promise<T>;
}

function jsonBody(payload: unknown): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    };
}

// --- Auth -------------------------------------------------------------------

export interface AuthUser {
    id: number;
    email: string;
    full_name: string | null;
    created_at: string;
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    user: AuthUser;
}

export const api = {
    // --- Auth ---
    register: (email: string, password: string, fullName?: string) =>
        request<TokenResponse>('/auth/register', jsonBody({
            email, password, full_name: fullName || null,
        })),

    /**
     * The login endpoint follows the OAuth2 password flow, so it takes form
     * fields named `username`/`password` rather than JSON.
     */
    login: (email: string, password: string) => {
        const form = new URLSearchParams();
        form.set('username', email);
        form.set('password', password);
        return request<TokenResponse>('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
        });
    },

    me: () => request<AuthUser>('/auth/me'),

    // --- Reference data ---
    getMeta: () => request<Meta>('/meta'),

    // --- Case management ---
    listApplications: () =>
        request<{ count: number; applications: ApplicationSummary[] }>('/applications'),

    createApplication: (companyName: string, sector: string) =>
        request<{ app_id: number; company_name: string; sector: string }>(
            '/applications', jsonBody({ company_name: companyName, sector }),
        ),

    deleteApplication: (appId: number) =>
        request<{ status: string }>(`/applications/${appId}`, { method: 'DELETE' }),

    // --- Reading a case ---
    getAnalysis: (appId: number) => request<Application>(`/applications/${appId}/analysis`),

    getDocuments: (appId: number) =>
        request<{ count: number; documents: CaseDocument[] }>(`/applications/${appId}/documents`),

    getEvents: (appId: number) =>
        request<{ count: number; events: ScoreEvent[] }>(`/applications/${appId}/events`),

    getBreakeven: (appId: number) => request<Breakeven>(`/applications/${appId}/breakeven`),

    // --- Actions ---
    uploadDocuments: (appId: number, files: File[]) => {
        const form = new FormData();
        files.forEach((file) => form.append('files', file));
        return request<UploadResult>(`/applications/${appId}/documents`, {
            method: 'POST',
            body: form,
        });
    },

    deleteDocument: (appId: number, docId: number) =>
        request<{ status: string; remaining: number }>(
            `/applications/${appId}/documents/${docId}`, { method: 'DELETE' },
        ),

    reanalyze: (appId: number) =>
        request<{ status: string; total_score: number; decision: string }>(
            `/applications/${appId}/reanalyze`, { method: 'POST' },
        ),

    updatePrimaryNotes: (
        appId: number, factoryCapacity: number, qualitativeNotes?: string, mgmtQuality?: number,
    ) =>
        request<{
            status: string; new_total: number; risk_grade: string;
            decision: string; overrides: string[];
        }>(`/applications/${appId}/primary-notes`, jsonBody({
            factory_capacity: factoryCapacity,
            qualitative_notes: qualitativeNotes || null,
            mgmt_quality: mgmtQuality ?? null,
        })),

    simulate: (appId: number, input: SimulationInput) =>
        request<SimulationResult>(`/applications/${appId}/simulate`, jsonBody(input)),

    // --- Model-assisted ---
    generateNarrative: (appId: number) =>
        request<{ status: string; narrative: CamNarrative }>(
            `/applications/${appId}/narrative`, { method: 'POST' },
        ),

    askAboutCase: (appId: number, question: string) =>
        request<{ question: string; answer: string }>(
            `/applications/${appId}/chat`, jsonBody({ question }),
        ),

    // --- Binary downloads ---
    /**
     * The memo and stored documents sit behind bearer auth, so they cannot be
     * fetched with a plain <a href>. They are pulled as a blob and handed to
     * the browser through a temporary object URL instead.
     */
    downloadCam: async (appId: number): Promise<Blob> =>
        (await raw(`/applications/${appId}/cam`)).blob(),

    downloadDocument: async (appId: number, docId: number): Promise<Blob> =>
        (await raw(`/applications/${appId}/documents/${docId}/download`)).blob(),
};

export interface IngestedFile {
    filename: string;
    doc_type: string;
    doc_label: string;
    doc_type_source: 'filename' | 'content' | 'llm';
    extraction_source: 'regex' | 'llm' | 'none';
    parse_status: 'parsed' | 'stored' | 'failed';
    message: string;
}

export interface UploadResult {
    status: string;
    ingested: IngestedFile[];
    parsed_count: number;
    total_score: number | null;
    risk_grade: string | null;
    decision: string | null;
}

/** Hands a fetched blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
