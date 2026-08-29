"""
Case orchestration: classify documents, ingest them, and recompute the
whole appraisal from scratch.

Recomputation is deliberately idempotent. Every run rebuilds the case from
the stored Document rows rather than mutating counters in place, so
re-analysing a case twice produces the same answer instead of doubling the
litigation count - which is what the previous accumulate-on-upload approach
did.
"""

from dataclasses import dataclass, field, replace

import pandas as pd

from app.analysis.decision_engine import decide_application
from app.analysis.five_cs import calculate_5cs_scores, risk_grade
from app.analysis.policy import PILLAR_WEIGHTS
from app.db.models import utcnow
from app.ingest.financial_analyzer import (
    analyze_cibil,
    analyze_itr,
    analyze_shareholding,
    derive_balance_sheet,
)
from app.ingest.gst_analyzer import analyze_bank_statement, analyze_gst
from app.ingest.pdf_parser import (
    extract_text_from_pdf,
    parse_board_minutes,
    parse_financials,
    parse_legal_notice,
    parse_rating_report,
    parse_sanction_letter,
)
from app.llm.classification import classify_via_llm
from app.llm.extraction import extract_financials_via_llm
from app.research.mock_research import (
    fetch_litigation_data,
    fetch_mca_data,
    fetch_news_sentiment,
    fetch_peer_benchmark,
)

# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

# Ordered: the first keyword match wins, so "gst_3b.pdf" is read as a GST
# document rather than falling through to the generic PDF handling.
DOC_RULES = [
    ("annual",       [".pdf"],  ["annual", "financial statement", "balance sheet"]),
    ("sanction",     [".pdf"],  ["sanction"]),
    ("legal",        [".pdf"],  ["legal", "notice", "summons"]),
    ("rating",       [".pdf"],  ["rating"]),
    ("board",        [".pdf"],  ["board", "minutes"]),
    ("gst",          [".csv", ".pdf"], ["gst", "gstr"]),
    ("bank",         [".csv"],  ["bank", "statement"]),
    ("shareholding", [".csv", ".pdf"], ["shareholding", "shareholder"]),
    ("itr",          [".csv"],  ["itr", "income tax", "tax return"]),
    ("cibil",        [".json"], ["cibil", "bureau"]),
]

DOC_LABELS = {
    "annual": "Annual report",
    "gst": "GST returns",
    "bank": "Bank statement",
    "sanction": "Sanction letter",
    "legal": "Legal notice",
    "rating": "Rating report",
    "board": "Board minutes",
    "cibil": "CIBIL commercial",
    "shareholding": "Shareholding pattern",
    "itr": "ITR summary",
    "unclassified": "Unclassified",
}


def classify(filename):
    """Map a filename to a document type, or 'unclassified'."""
    lower = (filename or "").lower()
    for doc_type, extensions, keywords in DOC_RULES:
        if not any(lower.endswith(ext) for ext in extensions):
            continue
        if any(k in lower for k in keywords):
            return doc_type
    return "unclassified"


# ---------------------------------------------------------------------------
# Per-document ingestion
# ---------------------------------------------------------------------------

@dataclass
class IngestResult:
    """What one file yielded, and how confident we are in each part of it."""

    extracted: dict = field(default_factory=dict)
    status: str = "stored"                 # parsed | stored | failed
    message: str = ""
    doc_type: str = "unclassified"
    doc_type_source: str = "filename"      # filename | content | llm
    extraction_source: str = "none"        # regex | llm | none


def _sniff_csv_type(df):
    """
    Identify a CSV by its columns when the filename gave nothing away.

    Deterministic and free, so it runs before the model is ever consulted.
    """
    columns = {str(c).strip().lower().replace(" ", "").replace("_", "") for c in df.columns}

    if "gstin" in columns:
        return "gst"
    if {"entity", "stake"} <= columns or "pledged" in columns:
        return "shareholding"
    if "totalincome" in columns:
        return "itr"
    if "description" in columns and ("amount" in columns or "credit" in columns):
        return "bank"
    return None


# Figures the scorer actually consumes. Booleans and the extraction method are
# excluded: an annual report that yielded only 'audit_qualification: False'
# has not really been read.
_FINANCIAL_KEYS = (
    "revenue", "ebitda", "dscr", "interest_expense", "total_debt", "net_worth",
    "interest_coverage", "debt_equity", "contingent_liabilities",
)


def _has_financial_figures(extracted):
    return any(extracted.get(key) is not None for key in _FINANCIAL_KEYS)


def ingest_document(path, filename, doc_type):
    """
    Parse one stored file.

    Classification is layered cheapest-first: the filename rules have already
    run, then the CSV column sniffer, then - only if both drew a blank - the
    model. Extraction follows the same principle: the regex parsers are
    authoritative and the model is a fallback for what they could not read.

    A parse failure is captured and reported rather than raised, so one
    malformed CSV cannot abort the ingestion of an entire case.
    """
    lower = filename.lower()
    result = IngestResult(doc_type=doc_type)

    try:
        if lower.endswith(".json"):
            with open(path, "rb") as handle:
                raw = handle.read()
            if doc_type == "cibil":
                extracted = analyze_cibil(raw)
                if not extracted.get("cibil_parsed"):
                    return replace(
                        result, extracted=extracted, status="failed",
                        message=extracted.get("cibil_error", "Malformed JSON"),
                    )
                return replace(
                    result, extracted=extracted, status="parsed",
                    extraction_source="regex",
                    message="Bureau score, delinquency and enquiry load read.",
                )
            return replace(result, message="JSON document stored without a matching parser.")

        if lower.endswith(".csv"):
            df = pd.read_csv(path)

            if doc_type == "unclassified":
                sniffed = _sniff_csv_type(df)
                if sniffed:
                    doc_type = sniffed
                    result = replace(result, doc_type=sniffed, doc_type_source="content")

            if doc_type == "gst":
                parsed = analyze_gst(df)
                return replace(
                    result, extracted=parsed, status="parsed", extraction_source="regex",
                    message=(
                        f"{parsed['sales_counterparties']} sales and "
                        f"{parsed['purchase_counterparties']} purchase counterparties screened."
                    ),
                )

            if doc_type == "bank":
                parsed = analyze_bank_statement(df)
                return replace(
                    result, extracted=parsed, status="parsed", extraction_source="regex",
                    message=(
                        f"{parsed['transaction_count']} transactions screened; "
                        f"{parsed['bounce_count']} dishonoured."
                    ),
                )

            if doc_type == "shareholding":
                parsed = analyze_shareholding(df)
                if not parsed.get("shareholding_parsed"):
                    return replace(
                        result, extracted=parsed, status="failed",
                        message="Expected Entity and Stake columns.",
                    )
                return replace(
                    result, extracted=parsed, status="parsed", extraction_source="regex",
                    message=(
                        f"Promoter holding {parsed['promoter_stake'] * 100:.1f}%, "
                        f"pledge {parsed['promoter_pledge'] * 100:.1f}%."
                    ),
                )

            if doc_type == "itr":
                parsed = analyze_itr(df)
                if not parsed.get("itr_parsed"):
                    return replace(
                        result, extracted=parsed, status="failed",
                        message="Expected a TotalIncome column.",
                    )
                return replace(
                    result, extracted=parsed, status="parsed", extraction_source="regex",
                    message="Declared income and tax paid read.",
                )

            return replace(result, message="CSV stored without a matching parser.")

        if lower.endswith(".pdf"):
            with open(path, "rb") as handle:
                raw = handle.read()
            text, method = extract_text_from_pdf(raw)

            if method in ("unreadable", "failed"):
                return replace(
                    result, extracted={"extraction_method": method}, status="failed",
                    message="No text layer could be read and OCR was unavailable.",
                )

            # A PDF the filename rules could not place: ask the model what it is
            # before giving up on it. Previously such a file was stored and
            # dropped out of scoring entirely.
            if doc_type == "unclassified":
                verdict = classify_via_llm(filename, text)
                if verdict:
                    doc_type = verdict["doc_type"]
                    result = replace(result, doc_type=doc_type, doc_type_source="llm")

            parsers = {
                "annual": parse_financials,
                "sanction": parse_sanction_letter,
                "legal": parse_legal_notice,
                "rating": parse_rating_report,
                "board": parse_board_minutes,
            }
            parser = parsers.get(doc_type)
            if parser is None:
                return replace(
                    result, extracted={"extraction_method": method},
                    message=f"Text read via {method}, but no parser is registered for this type.",
                )

            extracted = parser(text)
            extracted["extraction_method"] = method
            source = "regex"

            # Second pass: the regex parser found nothing quantitative in an
            # annual report, which is the signature of a scanned or unusually
            # laid-out document. This is where a model genuinely beats a regex.
            if doc_type == "annual" and not _has_financial_figures(extracted):
                inferred = extract_financials_via_llm(text)
                if inferred:
                    llm_fields = inferred.pop("llm_fields", [])
                    inferred.pop("extraction_source", None)
                    extracted.update(inferred)
                    extracted["llm_extracted_fields"] = llm_fields
                    source = "llm"

            found = [k for k in extracted if k != "extraction_method"]
            message = (
                f"Read via {method}; {len(found)} field(s) extracted."
                if found else f"Read via {method}; no known fields matched."
            )
            if source == "llm":
                message += " Figures recovered by model-assisted extraction."

            return replace(
                result, extracted=extracted, status="parsed",
                extraction_source=source, message=message,
            )

        return replace(result, message="Unsupported file type; stored against the case.")

    except Exception as exc:  # one bad file must not abort the case
        return replace(
            result, status="failed", message=f"{type(exc).__name__}: {exc}"[:400]
        )


# ---------------------------------------------------------------------------
# Whole-case recomputation
# ---------------------------------------------------------------------------

def _merge_documents(documents):
    """
    Fold every parsed document into one input dict for the scorer.

    Later documents of the same type override earlier ones, and the
    counters (litigation, bounces) are recomputed from scratch on every
    call rather than incremented.
    """
    merged = {}
    red_flags = []
    litigation_count = 0
    bounce_count = 0
    gst_sales_rs = None

    for doc in documents:
        extracted = doc.extracted or {}
        if not extracted:
            continue

        red_flags.extend(extracted.get("red_flags", []) or [])

        if doc.doc_type == "gst":
            merged["circular_trading_pct"] = extracted.get("circular_trading_pct", 0)
            merged["customer_concentration_pct"] = extracted.get("customer_concentration_pct", 0)
            gst_sales_rs = extracted.get("total_sales")

        elif doc.doc_type == "bank":
            bounce_count += extracted.get("bounce_count", 0)
            if extracted.get("observed_dscr") is not None:
                merged["observed_dscr"] = extracted["observed_dscr"]

        elif doc.doc_type == "legal":
            if extracted.get("is_ni_138"):
                litigation_count += 1
            if extracted.get("insolvency_reference"):
                merged["insolvency_reference"] = True

        elif doc.doc_type == "annual":
            for key in (
                "revenue", "ebitda", "dscr", "interest_expense", "total_debt",
                "net_worth", "interest_coverage", "debt_equity",
                "contingent_liabilities", "going_concern_doubt", "audit_qualification",
            ):
                if extracted.get(key) is not None:
                    merged[key] = extracted[key]

        elif doc.doc_type == "sanction":
            for key in ("existing_limits", "collateral_value", "existing_lender", "stated_covenants"):
                if extracted.get(key) is not None:
                    merged[key] = extracted[key]

        elif doc.doc_type == "rating":
            for key in ("external_rating", "rating_outlook", "investment_grade", "rating_downgrade"):
                if extracted.get(key) is not None:
                    merged[key] = extracted[key]

        elif doc.doc_type == "board":
            for key in ("related_party_flag", "auditor_resigned", "director_resigned"):
                if extracted.get(key):
                    merged[key] = True

        elif doc.doc_type == "cibil":
            for key in ("cibil_score", "cibil_dpd_30", "cibil_enquiries"):
                if extracted.get(key) is not None:
                    merged[key] = extracted[key]

        elif doc.doc_type == "shareholding":
            for key in ("promoter_stake", "promoter_pledge", "holders"):
                if extracted.get(key) is not None:
                    merged[key] = extracted[key]

        elif doc.doc_type == "itr":
            for key in ("itr_income_cr", "itr_total_income_rs", "effective_tax_rate"):
                if extracted.get(key) is not None:
                    merged[key] = extracted[key]

    # Cross-verify declared income against the GST sales register, now that
    # both sides have been collected.
    itr_income_rs = merged.get("itr_total_income_rs")
    if itr_income_rs and gst_sales_rs:
        mismatch = abs(itr_income_rs - gst_sales_rs) / max(itr_income_rs, gst_sales_rs) * 100
        merged["gst_turnover_mismatch_pct"] = round(mismatch, 2)
        if mismatch > 25:
            red_flags.append({
                "code": "TURNOVER_MISMATCH",
                "severity": "critical",
                "title": "Turnover mismatch across filings",
                "detail": (
                    f"Income declared to the tax authority differs from GST-reported "
                    f"turnover by {mismatch:.1f}%."
                ),
            })

    merged["litigation_count"] = litigation_count
    merged["bounce_count"] = bounce_count
    merged["red_flags"] = red_flags

    # Derived ratios from whatever the annual report yielded.
    merged.update(derive_balance_sheet(merged))

    # Security cover against the existing sanctioned exposure.
    collateral = merged.get("collateral_value")
    exposure = merged.get("existing_limits")
    if collateral and exposure:
        merged["security_cover"] = round(collateral / exposure, 2)

    return merged


def _document_flags(merged):
    """Turn parsed booleans into register entries the UI can render."""
    flags = []
    if merged.get("going_concern_doubt"):
        flags.append({
            "code": "GOING_CONCERN", "severity": "critical",
            "title": "Going-concern doubt",
            "detail": "The annual report references a material uncertainty over going concern.",
        })
    if merged.get("audit_qualification"):
        flags.append({
            "code": "AUDIT_QUALIFIED", "severity": "critical",
            "title": "Qualified audit opinion",
            "detail": "The auditor issued a qualified, adverse or disclaimed opinion.",
        })
    if merged.get("related_party_flag"):
        flags.append({
            "code": "RELATED_PARTY", "severity": "warning",
            "title": "Related-party transactions",
            "detail": "Board minutes record dealings with related entities.",
        })
    if merged.get("rating_downgrade"):
        flags.append({
            "code": "RATING_DOWNGRADE", "severity": "warning",
            "title": "Rating action",
            "detail": "The rating report references a downgrade or negative watch.",
        })
    if merged.get("insolvency_reference"):
        flags.append({
            "code": "INSOLVENCY", "severity": "critical",
            "title": "Insolvency reference",
            "detail": "An insolvency or IBC proceeding is referenced in the legal papers.",
        })
    if (merged.get("promoter_pledge") or 0) > 0.5:
        flags.append({
            "code": "PLEDGE_HIGH", "severity": "critical",
            "title": "Majority of promoter holding pledged",
            "detail": f"{merged['promoter_pledge'] * 100:.1f}% of the promoter stake is pledged.",
        })
    return flags


# ---------------------------------------------------------------------------
# Relationship manager overrides
# ---------------------------------------------------------------------------

# Keyword rules the RM's written observations trigger. These sit on top of the
# model rather than inside it, so they are reported as explicit adjustments.
NOTE_RULES = [
    (("underutil", "under-utilis", "under utilis"), "capacity", 5,
     "Capacity reduced by 5 for reported under-utilisation."),
    (("poor management", "bad management", "weak management"), "character", 5,
     "Character reduced by 5 for management concerns."),
    (("diversion", "siphon"), "character", 8,
     "Character reduced by 8 for suspected fund diversion."),
]


def apply_note_penalties(scores, qualitative_notes):
    """
    Fold the relationship manager's keyword overrides into the pillar scores.

    This returns adjusted scores and runs BEFORE the decision engine, rather
    than patching the engine's output afterwards. That ordering matters: a
    field note that drops the composite below the cut-off must also re-size
    the limit and regenerate the covenants, because a memo that recommends a
    limit the score no longer supports is worse than no memo. The previous
    implementation re-checked only the score gate and hand-edited the
    decision, leaving the limit and covenant package from the higher score.

    Pure: it does not touch the record or the database.
    """
    notes_lower = (qualitative_notes or "").lower()
    if not notes_lower:
        return scores, []

    adjusted = dict(scores)
    applied = []

    for keywords, pillar, penalty, message in NOTE_RULES:
        if any(k in notes_lower for k in keywords):
            adjusted[pillar] = max(0.0, round(adjusted[pillar] - penalty, 2))
            applied.append(message)

    if not applied:
        return scores, []

    adjusted["total"] = round(
        sum(adjusted[pillar] for pillar in PILLAR_WEIGHTS), 2
    )
    adjusted["risk_grade"] = risk_grade(adjusted["total"])
    return adjusted, applied


def recompute(app_record, documents, trigger="ingestion"):
    """
    Rebuild the entire appraisal from the stored documents plus research.

    Returns the fields to persist and a summary of what changed, without
    touching the database itself - the caller owns the session.
    """
    company = app_record.company_name or "Unknown"
    sector = app_record.sector or "Manufacturing"

    merged = _merge_documents(documents)

    # External research feeds.
    mca = fetch_mca_data(company)
    litigation = fetch_litigation_data(company)
    news = fetch_news_sentiment(company)

    merged["mca_red_flags"] = mca["red_flags"]
    merged["charges_created"] = mca["charges_created"]
    merged["news_sentiment"] = news["sentiment"]
    merged["sector"] = sector

    # Court-record matters count alongside the notices actually uploaded.
    merged["litigation_count"] = merged.get("litigation_count", 0) + litigation["cases_found"]

    # Human-in-the-loop inputs already captured on the case.
    if app_record.factory_capacity is not None:
        merged["factory_capacity"] = app_record.factory_capacity
    if app_record.mgmt_quality is not None:
        merged["mgmt_quality"] = app_record.mgmt_quality

    red_flags = list(merged.pop("red_flags", [])) + _document_flags(merged)
    if mca["din_dq"]:
        red_flags.append({
            "code": "DIN_DQ", "severity": "critical", "title": "Disqualified director",
            "detail": "At least one director carries a disqualified DIN on the MCA registry.",
        })
    if mca["annual_filing_default"]:
        red_flags.append({
            "code": "FILING_DEFAULT", "severity": "warning", "title": "Annual filing default",
            "detail": "Statutory annual filings are overdue with the registrar.",
        })
    if news["sentiment"] == "Negative":
        red_flags.append({
            "code": "ADVERSE_MEDIA", "severity": "warning", "title": "Adverse media",
            "detail": "Press screening returned predominantly negative coverage.",
        })

    scores = calculate_5cs_scores(merged)

    # Field-note overrides are folded in before the engine runs, and are
    # re-applied on every recompute, so an analyst's adjustment survives a
    # re-analysis or a document being removed.
    scores, applied_overrides = apply_note_penalties(scores, app_record.qualitative_notes)

    merged["_current_decision"] = app_record.decision
    outcome = decide_application(scores, merged)

    benchmark = fetch_peer_benchmark(sector, {
        "dscr": merged.get("dscr") or merged.get("observed_dscr"),
        "debt_equity": merged.get("debt_equity"),
        "ebitda_margin": merged.get("ebitda_margin"),
        "promoter_stake": merged.get("promoter_stake"),
    })

    previous_total = app_record.total_score

    fields = {
        "status": "Analyzed",
        "analysed_at": utcnow(),

        "revenue": merged.get("revenue"),
        "ebitda": merged.get("ebitda"),
        "dscr": merged.get("dscr") or merged.get("observed_dscr"),
        "interest_coverage": merged.get("interest_coverage"),
        "debt_equity": merged.get("debt_equity"),
        "net_worth": merged.get("net_worth"),

        "promoter_stake": merged.get("promoter_stake"),
        "promoter_pledge": merged.get("promoter_pledge"),
        "collateral_value": merged.get("collateral_value"),
        "security_cover": merged.get("security_cover"),
        "existing_limits": merged.get("existing_limits"),

        "cibil_score": merged.get("cibil_score"),
        "cibil_dpd_30": merged.get("cibil_dpd_30"),
        "cibil_enquiries": merged.get("cibil_enquiries"),
        "external_rating": merged.get("external_rating"),
        "rating_outlook": merged.get("rating_outlook"),

        "character_score": scores["character"],
        "capacity_score": scores["capacity"],
        "capital_score": scores["capital"],
        "collateral_score": scores["collateral"],
        "conditions_score": scores["conditions"],
        "total_score": scores["total"],
        "risk_grade": scores["risk_grade"],

        "gst_circular_trading_pct": merged.get("circular_trading_pct", 0),
        "gst_turnover_mismatch_pct": merged.get("gst_turnover_mismatch_pct"),
        "litigation_count": merged.get("litigation_count", 0),
        "bounce_count": merged.get("bounce_count", 0),
        "related_party_flag": bool(merged.get("related_party_flag")),

        "decision": outcome["decision"],
        "decision_reason": outcome["reason"],
        "recommended_limit_cr": outcome["recommended_limit_cr"],
        "spread": outcome["spread"],

        "score_breakdown": scores["breakdown"],
        "limit_working": outcome["limit_working"],
        "covenants": outcome["covenants"],
        "red_flags": red_flags,
        "research": {
            "mca": mca,
            "litigation": litigation,
            "news": news,
            "benchmark": benchmark,
        },
        "raw_data": {
            "merged_inputs": {
                k: v for k, v in merged.items()
                if not k.startswith("_") and not isinstance(v, (list, dict))
            },
            "evidence_coverage": scores["evidence_coverage"],
            "gates": outcome["gates"],
            "pricing": outcome["pricing"],
        },
    }

    if applied_overrides:
        fields["decision_reason"] = (
            f"{fields['decision_reason']} Field notes applied: "
            + " ".join(applied_overrides)
        )

    delta = None
    if previous_total is not None:
        delta = round(fields["total_score"] - previous_total, 2)

    parsed_docs = sum(1 for d in documents if d.parse_status == "parsed")
    summary = (
        f"{parsed_docs} of {len(documents)} document(s) parsed; "
        f"composite {fields['total_score']:.1f}/100 ({fields['risk_grade']}); "
        f"decision {fields['decision']}."
    )
    if applied_overrides:
        summary += f" {len(applied_overrides)} field-note override(s) applied."

    event = {
        "trigger": trigger,
        "summary": summary,
        "total_score": fields["total_score"],
        "decision": fields["decision"],
        "delta": delta,
        "detail": {
            "gates": outcome["gates"],
            "evidence_coverage": scores["evidence_coverage"],
            "pillars": {
                "character": fields["character_score"],
                "capacity": fields["capacity_score"],
                "capital": fields["capital_score"],
                "collateral": fields["collateral_score"],
                "conditions": fields["conditions_score"],
            },
            "overrides": applied_overrides,
        },
    }

    return fields, event
