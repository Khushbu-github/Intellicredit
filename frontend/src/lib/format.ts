/**
 * Display formatting helpers.
 *
 * The backend leaves a field null whenever a document did not yield a value,
 * so every formatter here has to degrade to an explicit placeholder rather
 * than rendering "undefined" or a misleading zero.
 */

export const EMPTY = '—';

const isMissing = (v: unknown): v is null | undefined =>
    v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));

/** Indian-format number with a fixed number of decimals. */
export function num(value?: number | null, decimals = 2): string {
    if (isMissing(value)) return EMPTY;
    return value.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** Whole number, no decimals. */
export function int(value?: number | null): string {
    if (isMissing(value)) return EMPTY;
    return Math.round(value).toLocaleString('en-IN');
}

/** Amounts held in crore, e.g. 125 -> "₹125.00 Cr". */
export function crore(value?: number | null, decimals = 2): string {
    if (isMissing(value)) return EMPTY;
    return `₹${num(value, decimals)} Cr`;
}

/** Ratios rendered with the banking "x" suffix, e.g. 1.03 -> "1.03x". */
export function times(value?: number | null, decimals = 2): string {
    if (isMissing(value)) return EMPTY;
    return `${num(value, decimals)}x`;
}

/** Percentages, e.g. 18.4 -> "18.4%". */
export function pct(value?: number | null, decimals = 1): string {
    if (isMissing(value)) return EMPTY;
    return `${num(value, decimals)}%`;
}

/** Trims trailing zeros so score chips read "18.5" rather than "18.50". */
export function score(value?: number | null): string {
    if (isMissing(value)) return EMPTY;
    return String(Math.round(value * 10) / 10);
}

export function fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeOf(d: Date): string {
    return d.toLocaleTimeString('en-GB', { hour12: false });
}

export function dateOf(d: Date): string {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Zero-padded case reference, e.g. 5 -> "IC-0005". */
export function caseRef(id: number): string {
    return `IC-${String(id).padStart(4, '0')}`;
}
