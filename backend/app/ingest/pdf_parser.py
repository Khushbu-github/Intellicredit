import io
import re

try:
    import pytesseract
    from PIL import Image
except ImportError:  # OCR is optional; text extraction still works without it
    pytesseract = None
    Image = None

from pypdf import PdfReader

# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(file_bytes):
    """
    Pull the text layer out of a PDF, falling back to OCR for scans.

    Returns (text, method) so callers can record how a figure was obtained -
    an OCR-derived number carries less confidence than one read from a
    proper text layer, and the audit trail says which was used.
    """
    text = ""
    method = "text-layer"

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"
    except Exception as exc:
        print(f"Text extraction failed: {exc}")
        method = "failed"

    if len(text.strip()) < 10:
        # Some demo fixtures are plain text written with a .pdf extension;
        # read them directly before deciding the document is a scan.
        try:
            decoded = file_bytes.decode("utf-8", errors="ignore")
            if len(decoded.strip()) >= 10 and "%PDF" not in decoded[:10]:
                return decoded, "plain-text"
        except Exception:
            pass

        if pytesseract is not None and Image is not None:
            try:
                image = Image.open(io.BytesIO(file_bytes))
                text = pytesseract.image_to_string(image)
                method = "ocr"
            except Exception as exc:
                print(f"OCR failed: {exc}")
                method = "unreadable"
        else:
            method = "unreadable"

    return text, method


# ---------------------------------------------------------------------------
# Amount parsing
# ---------------------------------------------------------------------------

_CR_WORDS = r"(?:cr|crore|crores)"
_LAKH_WORDS = r"(?:lakh|lakhs|lac|lacs)"


def _amount_to_crore(raw, unit_hint=""):
    """
    Normalise an Indian-format amount to crore.

    Handles "125.0 Cr", "12,50,00,000" (absolute rupees) and "250 lakh",
    because sanction letters and legal notices in this corpus use all three.
    """
    if raw is None:
        return None
    cleaned = str(raw).replace(",", "").strip()
    try:
        value = float(cleaned)
    except ValueError:
        return None

    hint = unit_hint.lower()
    if re.search(_CR_WORDS, hint):
        return round(value, 4)
    if re.search(_LAKH_WORDS, hint):
        return round(value / 100.0, 4)

    # No unit given: a bare figure in the tens of millions is rupees.
    if value >= 1e5:
        return round(value / 1e7, 4)
    return round(value, 4)


def _search_amount(text, label_pattern):
    """Find `label: <amount> <unit>` and return the amount in crore."""
    pattern = (
        rf"{label_pattern}[:\s]*(?:INR|Rs\.?|₹)?\s*"
        rf"([\d,]+(?:\.\d+)?)\s*"
        rf"({_CR_WORDS}|{_LAKH_WORDS})?"
    )
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return None
    return _amount_to_crore(match.group(1), match.group(2) or "")


# ---------------------------------------------------------------------------
# Document-specific parsers
# ---------------------------------------------------------------------------

def parse_financials(text):
    """
    Annual report -> the figures the 5Cs model scores on.

    Every field is optional. Absent figures are omitted from the result
    rather than returned as 0.0, so a missing revenue is never mistaken
    for a company that earned nothing.
    """
    results = {}

    for field, label in (
        ("revenue", r"(?:Total\s+)?(?:Revenue|Turnover|Net\s+Sales)"),
        ("ebitda", r"EBITDA"),
        ("interest_expense", r"(?:Interest\s+(?:Expense|Cost)|Finance\s+Cost)"),
        ("total_debt", r"(?:Total\s+)?(?:Debt|Borrowings)"),
        ("net_worth", r"(?:Net\s*worth|Shareholders?'?\s+(?:Equity|Funds))"),
    ):
        value = _search_amount(text, label)
        if value is not None:
            results[field] = value

    dscr_match = re.search(r"DSCR[:\s]*([\d.]+)\s*x?", text, re.IGNORECASE)
    if dscr_match:
        try:
            results["dscr"] = float(dscr_match.group(1))
        except ValueError:
            pass

    icr_match = re.search(
        r"Interest\s+Coverage(?:\s+Ratio)?[:\s]*([\d.]+)\s*x?", text, re.IGNORECASE
    )
    if icr_match:
        try:
            results["interest_coverage"] = float(icr_match.group(1))
        except ValueError:
            pass

    de_match = re.search(
        r"(?:Debt[\s/-]*(?:to)?[\s/-]*Equity|D/E)(?:\s+Ratio)?[:\s]*([\d.]+)\s*x?",
        text,
        re.IGNORECASE,
    )
    if de_match:
        try:
            results["debt_equity"] = float(de_match.group(1))
        except ValueError:
            pass

    if re.search(r"contingent\s+liabilit", text, re.IGNORECASE):
        results["contingent_liabilities"] = True
        amount = _search_amount(text, r"Contingent\s+liabilit(?:y|ies)")
        if amount is not None:
            results["contingent_liability_cr"] = amount

    if re.search(r"going\s+concern", text, re.IGNORECASE):
        results["going_concern_doubt"] = True

    if re.search(r"qualified\s+opinion|adverse\s+opinion|disclaimer\s+of\s+opinion", text, re.IGNORECASE):
        results["audit_qualification"] = True

    return results


def parse_sanction_letter(text):
    """Existing sanction letter -> facility limits and stated covenants."""
    results = {}

    limit = _search_amount(text, r"(?:Existing\s+)?(?:Sanctioned\s+)?Limit")
    if limit is not None:
        results["existing_limits"] = limit

    lender = re.search(r"from\s+([A-Z][A-Za-z&.\s]{2,40}Bank)", text)
    if lender:
        results["existing_lender"] = lender.group(1).strip()

    covenants = re.findall(r"Covenant[:\s]*([^\n.]{3,120})", text, re.IGNORECASE)
    if covenants:
        results["stated_covenants"] = [c.strip() for c in covenants]

    security = _search_amount(text, r"(?:Security|Collateral)\s*(?:value|cover)?")
    if security is not None:
        results["collateral_value"] = security

    return results


def parse_legal_notice(text):
    """Legal notice -> NI Act §138 exposure and the demand amount."""
    results = {"is_ni_138": False}

    if re.search(r"NI\s*Act|Section\s*138|Negotiable\s+Instruments", text, re.IGNORECASE):
        results["is_ni_138"] = True

    amount = _search_amount(text, r"(?:Demand\s+amount|Claim\s+amount|Amount\s+due)")
    if amount is not None:
        results["litigation_amount_cr"] = amount

    court = re.search(r"([A-Z][A-Za-z\s]{2,30}(?:High\s+Court|District\s+Court|Tribunal|NCLT))", text)
    if court:
        results["jurisdiction"] = court.group(1).strip()

    if re.search(r"insolvency|IBC|NCLT", text, re.IGNORECASE):
        results["insolvency_reference"] = True

    return results


# Investment grade in the Indian long-term scale runs down to BBB-.
_INVESTMENT_GRADE = {"AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-"}


def parse_rating_report(text):
    """
    External rating report -> agency grade and outlook.

    Previously ignored entirely, though the demo corpus ships one; the
    grade and a negative outlook both feed the Conditions pillar.
    """
    results = {}

    grade = re.search(
        r"(?:Credit\s+)?Rating[:\s]*(?:IND\s+|CRISIL\s+|ICRA\s+|CARE\s+)?"
        r"([A-D]{1,3}[+-]?)\s*(?:/\s*)?(Stable|Negative|Positive|Developing|Watch)?",
        text,
        re.IGNORECASE,
    )
    if grade:
        results["external_rating"] = grade.group(1).upper()
        if grade.group(2):
            results["rating_outlook"] = grade.group(2).capitalize()
        results["investment_grade"] = results["external_rating"] in _INVESTMENT_GRADE

    if "rating_outlook" not in results:
        outlook = re.search(r"Outlook[:\s]*(Stable|Negative|Positive|Developing)", text, re.IGNORECASE)
        if outlook:
            results["rating_outlook"] = outlook.group(1).capitalize()

    if re.search(r"downgrade|rating\s+watch\s+with\s+negative", text, re.IGNORECASE):
        results["rating_downgrade"] = True

    return results


def parse_board_minutes(text):
    """
    Board minutes -> governance signals.

    Related-party transactions and auditor resignations are governance red
    flags that belong in the Character pillar.
    """
    results = {}

    if re.search(r"related\s+part(?:y|ies)", text, re.IGNORECASE):
        results["related_party_flag"] = True

    if re.search(r"auditor\s+resign|resignation\s+of\s+(?:the\s+)?auditor", text, re.IGNORECASE):
        results["auditor_resigned"] = True

    if re.search(r"director\s+resign|resignation\s+of\s+(?:a\s+)?director", text, re.IGNORECASE):
        results["director_resigned"] = True

    return results
