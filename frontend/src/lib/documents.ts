/**
 * Document routing rules, mirrored from backend/analysis/pipeline.py.
 *
 * The backend routes each upload by filename keyword and extension, so
 * knowing the same rules lets the UI tell the analyst, before they run the
 * ingestion, exactly which documents will be parsed and which will only be
 * stored against the case.
 */

export interface DocType {
    key: string;
    label: string;
    accepts: string;
    /** What the ingestor pulls out of this document. */
    extracts: string;
    /** Filename must contain one of these, case-insensitive. */
    keywords: string[];
    /** Accepted extensions. */
    exts: string[];
    required: boolean;
}

/**
 * Order matters: the first match wins, exactly as in the backend, so
 * "gst_3b.pdf" is read as a GST document rather than as an annual report.
 */
export const DOC_TYPES: DocType[] = [
    {
        key: 'annual',
        label: 'Annual report',
        accepts: 'PDF · audited financials',
        extracts: 'Revenue, EBITDA, DSCR, leverage, audit qualifications',
        keywords: ['annual', 'financial statement', 'balance sheet'],
        exts: ['.pdf'],
        required: true,
    },
    {
        key: 'sanction',
        label: 'Sanction letter',
        accepts: 'PDF · existing limits',
        extracts: 'Sanctioned limits, lender, covenants, security value',
        keywords: ['sanction'],
        exts: ['.pdf'],
        required: false,
    },
    {
        key: 'legal',
        label: 'Legal notice',
        accepts: 'PDF · court orders',
        extracts: 'NI Act §138 exposure, demand amount, jurisdiction',
        keywords: ['legal', 'notice', 'summons'],
        exts: ['.pdf'],
        required: false,
    },
    {
        key: 'rating',
        label: 'Rating report',
        accepts: 'PDF · agency report',
        extracts: 'External grade, outlook, downgrade actions',
        keywords: ['rating'],
        exts: ['.pdf'],
        required: false,
    },
    {
        key: 'board',
        label: 'Board minutes',
        accepts: 'PDF · governance record',
        extracts: 'Related-party dealings, auditor and director resignations',
        keywords: ['board', 'minutes'],
        exts: ['.pdf'],
        required: false,
    },
    {
        key: 'gst',
        label: 'GST returns',
        accepts: 'CSV · GSTR-1 / 3B register',
        extracts: 'Circular trading, counterparty concentration, turnover',
        keywords: ['gst', 'gstr'],
        exts: ['.csv', '.pdf'],
        required: true,
    },
    {
        key: 'bank',
        label: 'Bank statement',
        accepts: 'CSV · 6 months',
        extracts: 'Cheque returns, credit turnover, observed debt service',
        keywords: ['bank', 'statement'],
        exts: ['.csv'],
        required: true,
    },
    {
        key: 'shareholding',
        label: 'Shareholding pattern',
        accepts: 'CSV · holder register',
        extracts: 'Promoter holding and pledged share of that holding',
        keywords: ['shareholding', 'shareholder'],
        exts: ['.csv', '.pdf'],
        required: false,
    },
    {
        key: 'itr',
        label: 'ITR summary',
        accepts: 'CSV · income tax return',
        extracts: 'Declared income, tax paid, GST turnover reconciliation',
        keywords: ['itr', 'income tax', 'tax return'],
        exts: ['.csv'],
        required: false,
    },
    {
        key: 'cibil',
        label: 'CIBIL commercial',
        accepts: 'JSON · bureau pull',
        extracts: 'Commercial score, 30+ DPD accounts, enquiry load',
        keywords: ['cibil', 'bureau'],
        exts: ['.json'],
        required: false,
    },
];

/** Returns the document type a file will be routed to, or null if only stored. */
export function classify(filename: string): DocType | null {
    const lower = (filename || '').toLowerCase();
    return (
        DOC_TYPES.find(
            (t) => t.exts.some((ext) => lower.endsWith(ext)) && t.keywords.some((k) => lower.includes(k)),
        ) ?? null
    );
}

/** Why a file was not matched — shown inline so naming can be corrected. */
export function unmatchedReason(filename: string): string {
    const lower = (filename || '').toLowerCase();
    if (!['.pdf', '.csv', '.json'].some((ext) => lower.endsWith(ext))) {
        return 'Stored only — the ingestor reads PDF, CSV and JSON';
    }
    return 'Stored only — filename matches no document type';
}

/** Human label for a backend doc_type key. */
export function labelFor(docType: string): string {
    return DOC_TYPES.find((t) => t.key === docType)?.label ?? 'Unclassified';
}

/** Readable names for the raw keys inside a document's `extracted` payload. */
export const FIELD_LABELS: Record<string, string> = {
    revenue: 'Revenue (Cr)',
    ebitda: 'EBITDA (Cr)',
    dscr: 'DSCR',
    interest_expense: 'Interest cost (Cr)',
    total_debt: 'Total debt (Cr)',
    net_worth: 'Net worth (Cr)',
    interest_coverage: 'Interest coverage',
    debt_equity: 'Debt / equity',
    contingent_liabilities: 'Contingent liabilities',
    contingent_liability_cr: 'Contingent liability (Cr)',
    going_concern_doubt: 'Going-concern doubt',
    audit_qualification: 'Audit qualification',
    existing_limits: 'Existing limits (Cr)',
    existing_lender: 'Existing lender',
    collateral_value: 'Security value (Cr)',
    stated_covenants: 'Stated covenants',
    is_ni_138: 'NI Act §138 matter',
    litigation_amount_cr: 'Demand amount (Cr)',
    jurisdiction: 'Jurisdiction',
    insolvency_reference: 'Insolvency reference',
    external_rating: 'External rating',
    rating_outlook: 'Outlook',
    investment_grade: 'Investment grade',
    rating_downgrade: 'Downgrade action',
    related_party_flag: 'Related-party dealings',
    auditor_resigned: 'Auditor resigned',
    director_resigned: 'Director resigned',
    cibil_score: 'CIBIL score',
    cibil_dpd_30: 'Accounts 30+ DPD',
    cibil_enquiries: 'Bureau enquiries',
    promoter_stake: 'Promoter holding',
    promoter_pledge: 'Promoter pledge',
    circular_trading_pct: 'Circular trading',
    customer_concentration_pct: 'Customer concentration',
    sales_counterparties: 'Sales counterparties',
    purchase_counterparties: 'Purchase counterparties',
    total_sales: 'Total sales (Rs)',
    total_purchases: 'Total purchases (Rs)',
    top_counterparty: 'Largest counterparty',
    bounce_count: 'Dishonoured instruments',
    bounce_rate_pct: 'Return rate',
    transaction_count: 'Transactions screened',
    total_credits: 'Credit turnover (Rs)',
    total_debits: 'Debit turnover (Rs)',
    observed_debt_service: 'Observed debt service (Rs)',
    observed_dscr: 'Observed DSCR',
    itr_total_income_rs: 'Declared income (Rs)',
    itr_income_cr: 'Declared income (Cr)',
    itr_tax_paid_rs: 'Tax paid (Rs)',
    effective_tax_rate: 'Effective tax rate',
    extraction_method: 'Read via',
};
