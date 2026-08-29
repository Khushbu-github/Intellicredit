"""
Generate demo borrower packs for local development and demonstrations.

Three complete borrowers are produced, chosen so the decision engine reaches a
different verdict on each: one that clears every gate, one that cannot be sized
for want of documents, and one carrying the fraud and distress signals the
screening layer exists to catch.

The PDFs written here are real PDFs, not text files renamed. That matters: the
upload endpoint verifies a file's leading bytes against the type its extension
claims, so a text file called .pdf is rejected before it reaches a parser -
which is exactly the behaviour we want in production and exactly what would
make a demo pack of renamed text files useless.

Usage:
    python scripts/generate_demo_data.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

OUTPUT_ROOT = Path("samples")


# ---------------------------------------------------------------------------
# Minimal PDF writer
# ---------------------------------------------------------------------------

def _escape(text: str) -> str:
    """Escape the three characters that are special inside a PDF string."""
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def write_pdf(path: Path, title: str, lines: list[str]) -> None:
    """
    Write a single-page PDF containing `lines` as extractable text.

    Hand-rolled rather than pulling in reportlab: the demo pack needs a few
    hundred bytes of valid PDF with a readable text layer, and a whole
    reporting library would be a production dependency carried for a script.

    The cross-reference table needs each object's exact byte offset, so the
    body is assembled first and the offsets recorded as it is built.
    """
    content_lines = [f"BT /F1 11 Tf 54 {760 - i * 18} Td ({_escape(line)}) Tj ET"
                     for i, line in enumerate([title, ""] + lines)]
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()

    path.write_bytes(bytes(out))


# ---------------------------------------------------------------------------
# Borrower profiles
# ---------------------------------------------------------------------------

BORROWERS = {
    # Clears every gate: strong coverage, clean conduct, ample security.
    "strong_borrower": {
        "label": "Vishwakarma Steel Ltd - expected APPROVE",
        "annual": [
            "VISHWAKARMA STEEL LIMITED",
            "Audited Financial Statements for the year ended 31 March 2026",
            "",
            "Total Revenue: Rs 1,250.00 Crore",
            "EBITDA: Rs 187.50 Crore",
            "Finance Cost: Rs 42.00 Crore",
            "Total Borrowings: Rs 520.00 Crore",
            "Net worth: Rs 640.00 Crore",
            "DSCR: 1.85x",
            "Interest Coverage Ratio: 4.46x",
            "Debt to Equity Ratio: 0.81x",
            "",
            "In our opinion the financial statements give a true and fair view.",
        ],
        "sanction": [
            "Sanctioned Limit: Rs 220.00 Crore from State Bank",
            "Security value: Rs 480.00 Crore",
            "Covenant: Minimum DSCR of 1.25x to be maintained",
        ],
        "rating": ["Credit Rating: CRISIL AA- / Stable", "Outlook: Stable"],
        "board": ["Board reviewed and approved the minutes of the previous meeting."],
        "gst": [
            {"Type": "Sale", "GSTIN": "27AAAAA0000A1Z5", "Amount": 420000000, "Date": "2026-01-05"},
            {"Type": "Sale", "GSTIN": "27BBBBB1111B1Z2", "Amount": 380000000, "Date": "2026-01-12"},
            {"Type": "Sale", "GSTIN": "27DDDDD3333D1Z7", "Amount": 450000000, "Date": "2026-02-02"},
            {"Type": "Purchase", "GSTIN": "27PPPPP7777P1Z1", "Amount": 260000000, "Date": "2026-01-20"},
            {"Type": "Purchase", "GSTIN": "27QQQQQ8888Q1Z4", "Amount": 190000000, "Date": "2026-02-11"},
        ],
        "bank": [
            {"Date": "2026-01-04", "Description": "NEFT FROM CUSTOMER A", "Amount": 42000000, "Type": "CR"},
            {"Date": "2026-01-18", "Description": "EMI STATE BANK TERM LOAN", "Amount": 9500000, "Type": "DR"},
            {"Date": "2026-02-04", "Description": "NEFT FROM CUSTOMER B", "Amount": 38000000, "Type": "CR"},
            {"Date": "2026-02-18", "Description": "EMI STATE BANK TERM LOAN", "Amount": 9500000, "Type": "DR"},
            {"Date": "2026-03-04", "Description": "RTGS FROM CUSTOMER C", "Amount": 45000000, "Type": "CR"},
        ],
        "shareholding": [
            {"Entity": "Promoter - Vishwakarma Family Trust", "Stake": 58, "Pledged": 4},
            {"Entity": "Institutional investors", "Stake": 27, "Pledged": 0},
            {"Entity": "Public", "Stake": 15, "Pledged": 0},
        ],
        "itr": [{"Year": "AY2025-26", "TotalIncome": 12400000000, "TaxPaid": 3100000000}],
        "cibil": {"score": 802, "dpd_30": 0, "total_enquiries": 2},
    },

    # Fails on evidence rather than on conduct. Conduct, ownership and standing
    # are all well documented, so the composite clears the cut-off - but the
    # audited financials and the security valuation are missing, so none of the
    # three limit methods can be computed and the engine must REFER rather than
    # approve a facility it cannot size.
    "thin_file_borrower": {
        "label": "Meghna Textiles Pvt Ltd - expected REFER (no limit can be sized)",
        # Deliberately absent: revenue, EBITDA and collateral all come from
        # these two documents, and every limit method needs one of them.
        "annual": None,
        "sanction": None,
        "rating": ["Credit Rating: CRISIL A / Stable", "Outlook: Stable"],
        "board": [
            "Board noted the quarterly operational update.",
            "The board confirmed no related party transactions in the period.",
        ],
        "gst": [
            {"Type": "Sale", "GSTIN": "24AAAAA1234A1Z5", "Amount": 210000000, "Date": "2026-01-09"},
            {"Type": "Sale", "GSTIN": "24BBBBB2345B1Z7", "Amount": 185000000, "Date": "2026-01-27"},
            {"Type": "Sale", "GSTIN": "24CCCCC3456C1Z1", "Amount": 174000000, "Date": "2026-02-14"},
            {"Type": "Purchase", "GSTIN": "24RRRRR5555R1Z2", "Amount": 121000000, "Date": "2026-01-23"},
            {"Type": "Purchase", "GSTIN": "24SSSSS6666S1Z9", "Amount": 98000000, "Date": "2026-02-19"},
        ],
        "bank": [
            {"Date": "2026-01-07", "Description": "NEFT FROM BUYER", "Amount": 21000000, "Type": "CR"},
            {"Date": "2026-01-22", "Description": "EMI CANARA BANK TERM LOAN", "Amount": 4200000, "Type": "DR"},
            {"Date": "2026-02-07", "Description": "NEFT FROM BUYER", "Amount": 19500000, "Type": "CR"},
            {"Date": "2026-02-22", "Description": "EMI CANARA BANK TERM LOAN", "Amount": 4200000, "Type": "DR"},
            {"Date": "2026-03-07", "Description": "RTGS FROM BUYER", "Amount": 22400000, "Type": "CR"},
        ],
        "shareholding": [
            {"Entity": "Promoter - Meghna Family", "Stake": 64, "Pledged": 0},
            {"Entity": "Public", "Stake": 36, "Pledged": 0},
        ],
        "itr": [{"Year": "AY2025-26", "TotalIncome": 5690000000, "TaxPaid": 1420000000}],
        "cibil": {"score": 776, "dpd_30": 0, "total_enquiries": 3},
    },

    # Every screening signal the product exists to catch: circular trading,
    # an ITR/GST turnover gap, cheque returns, litigation, a heavy promoter
    # pledge, a going-concern note and a qualified audit opinion.
    "distressed_borrower": {
        "label": "Ashwin Infra Ltd - expected REJECT (fraud and distress signals)",
        "annual": [
            "ASHWIN INFRA LIMITED",
            "Audited Financial Statements for the year ended 31 March 2026",
            "",
            "Total Revenue: Rs 310.00 Crore",
            "EBITDA: Rs 18.60 Crore",
            "Finance Cost: Rs 34.00 Crore",
            "Total Borrowings: Rs 402.00 Crore",
            "Net worth: Rs 61.00 Crore",
            "DSCR: 0.72x",
            "Interest Coverage Ratio: 0.55x",
            "Debt to Equity Ratio: 6.59x",
            "",
            "Contingent liabilities not provided for: Rs 46.00 Crore",
            "The auditor has expressed a qualified opinion on these statements.",
            "A material uncertainty exists that may cast doubt on the ability of",
            "the Company to continue as a going concern.",
        ],
        "sanction": [
            "Sanctioned Limit: Rs 180.00 Crore from Union Bank",
            "Security value: Rs 96.00 Crore",
            "Covenant: Debt to equity not to exceed 3.00x",
        ],
        "rating": [
            "Credit Rating: BB- / Negative",
            "The agency has announced a downgrade from BBB- following weak coverage.",
        ],
        "board": [
            "The board approved related party transactions with Ashwin Holdings Pvt Ltd.",
            "The resignation of the statutory auditor was placed on record.",
        ],
        "legal": [
            "LEGAL NOTICE",
            "Notice under Section 138 of the Negotiable Instruments Act, 1881.",
            "Demand amount: Rs 4.20 Crore towards dishonoured cheques.",
            "Before the Bombay High Court.",
        ],
        # The same GSTINs appear on both sides of the register - the classic
        # circular-trading signature.
        "gst": [
            {"Type": "Sale", "GSTIN": "27ZZZZZ1111Z1Z5", "Amount": 90000000, "Date": "2026-01-06"},
            {"Type": "Sale", "GSTIN": "27YYYYY2222Y1Z3", "Amount": 76000000, "Date": "2026-01-14"},
            {"Type": "Sale", "GSTIN": "27XXXXX3333X1Z8", "Amount": 64000000, "Date": "2026-02-03"},
            {"Type": "Purchase", "GSTIN": "27ZZZZZ1111Z1Z5", "Amount": 82000000, "Date": "2026-01-21"},
            {"Type": "Purchase", "GSTIN": "27YYYYY2222Y1Z3", "Amount": 71000000, "Date": "2026-02-09"},
        ],
        "bank": [
            {"Date": "2026-01-05", "Description": "NEFT FROM CLIENT", "Amount": 6200000, "Type": "CR"},
            {"Date": "2026-01-15", "Description": "CHQ RETURN - INSUFFICIENT FUNDS", "Amount": 4200000, "Type": "DR"},
            {"Date": "2026-02-02", "Description": "EMI UNION BANK TERM LOAN", "Amount": 8800000, "Type": "DR"},
            {"Date": "2026-02-16", "Description": "CHEQUE BOUNCE CHARGES", "Amount": 590, "Type": "DR"},
            {"Date": "2026-03-06", "Description": "CHQ RETURN - FUNDS INSUFFICIENT", "Amount": 3100000, "Type": "DR"},
        ],
        "shareholding": [
            {"Entity": "Promoter - Ashwin Family Holdings", "Stake": 51, "Pledged": 78},
            {"Entity": "Public", "Stake": 49, "Pledged": 0},
        ],
        # Declared income is a fraction of GST-reported turnover.
        "itr": [{"Year": "AY2025-26", "TotalIncome": 890000000, "TaxPaid": 41000000}],
        "cibil": {"score": 561, "dpd_30": 3, "total_enquiries": 11},
    },
}


def build(name: str, profile: dict) -> int:
    directory = OUTPUT_ROOT / name
    directory.mkdir(parents=True, exist_ok=True)
    written = 0

    pdfs = {
        "annual_report.pdf": ("Annual Report 2025-26", profile.get("annual")),
        "sanction_letter.pdf": ("Existing Sanction Letter", profile.get("sanction")),
        "rating_report.pdf": ("External Credit Rating Report", profile.get("rating")),
        "board_minutes.pdf": ("Minutes of the Board Meeting", profile.get("board")),
        "legal_notice.pdf": ("Legal Notice", profile.get("legal")),
    }
    for filename, (title, lines) in pdfs.items():
        if lines:
            write_pdf(directory / filename, title, lines)
            written += 1

    csvs = {
        "gst_returns.csv": profile.get("gst"),
        "bank_statement.csv": profile.get("bank"),
        "shareholding_pattern.csv": profile.get("shareholding"),
        "itr_summary.csv": profile.get("itr"),
    }
    for filename, rows in csvs.items():
        if rows:
            pd.DataFrame(rows).to_csv(directory / filename, index=False)
            written += 1

    if profile.get("cibil"):
        (directory / "cibil_commercial.json").write_text(
            json.dumps(profile["cibil"], indent=2), encoding="utf-8"
        )
        written += 1

    return written


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    for name, profile in BORROWERS.items():
        count = build(name, profile)
        print(f"  {name:<22} {count:>2} files  - {profile['label']}")
    print(f"\nWritten to {OUTPUT_ROOT.resolve()}")


if __name__ == "__main__":
    main()
