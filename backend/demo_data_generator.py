import pandas as pd
import os
import json

# Ensure target directory exists
UPLOAD_DIR = "files/demo_app"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def generate_csvs():
    # 1. gst_returns.csv (Circular trading: Overlap between sales and purchases)
    gst_data = [
        {"Type": "Sale", "GSTIN": "27AAAAA0000A1Z5", "Amount": 500000, "Date": "2026-01-01"},
        {"Type": "Sale", "GSTIN": "27BBBBB1111B1Z2", "Amount": 300000, "Date": "2026-01-05"},
        {"Type": "Purchase", "GSTIN": "27AAAAA0000A1Z5", "Amount": 450000, "Date": "2026-01-10"}, # Overlap!
        {"Type": "Purchase", "GSTIN": "27CCCCC2222C1Z3", "Amount": 200000, "Date": "2026-01-15"},
    ]
    pd.DataFrame(gst_data).to_csv(os.path.join(UPLOAD_DIR, "gst_returns.csv"), index=False)

    # 2. bank_statement.csv (Cheque bounces)
    bank_data = [
        {"Date": "2026-02-01", "Description": "TRF FROM CLIENT A", "Amount": 100000, "Type": "CR"},
        {"Date": "2026-02-05", "Description": "CHQ RETURN - INSUFFICIENT FUNDS", "Amount": 50000, "Type": "DR"}, # BOUNCE
        {"Date": "2026-02-10", "Description": "EMI HDFC BANK", "Amount": 25000, "Type": "DR"},
        {"Date": "2026-02-15", "Description": "NEFT BOUNCE FEE", "Amount": 500, "Type": "DR"}, # BOUNCE
    ]
    pd.DataFrame(bank_data).to_csv(os.path.join(UPLOAD_DIR, "bank_statement.csv"), index=False)

    # 3. itr_summary.csv
    itr_data = [
        {"Year": "AY2025-26", "TotalIncome": 1250000000, "TaxPaid": 300000000}
    ]
    pd.DataFrame(itr_data).to_csv(os.path.join(UPLOAD_DIR, "itr_summary.csv"), index=False)

    # 4. shareholding.csv
    sh_data = [
        {"Entity": "Promoter A", "Stake": 45, "Pledged": 20},
        {"Entity": "Public", "Stake": 55, "Pledged": 0}
    ]
    pd.DataFrame(sh_data).to_csv(os.path.join(UPLOAD_DIR, "shareholding.csv"), index=False)

    # 5. cibil_commercial.json
    cibil_data = {
        "score": 710,
        "dpd_30": 2,
        "total_enquiries": 5
    }
    with open(os.path.join(UPLOAD_DIR, "cibil_commercial.json"), "w", encoding="utf-8") as f:
        json.dump(cibil_data, f)

def generate_mock_pdfs():
    # Since we can't easily generate real PDFs with text content without extra libs in this environment,
    # we will create empty or text files with .pdf extension that contain the keywords our parser looks for.
    # In a real demo, these would be proper PDFs.
    
    files = {
        "annual_report.pdf": "Revenue: ₹125.0 Cr, EBITDA: ₹25.0, DSCR: 1.03x, Contingent liability: ₹10Cr pending litigation.",
        "sanction_letter.pdf": "Existing Limit: ₹50,00,00,000 from HDFC Bank. Covenant: DSCR > 1.2x",
        "legal_notice.pdf": "Legal Notice under Section 138 of NI Act. Demand amount: ₹2,50,00,000 for unpaid dues.",
        "rating_report.pdf": "Credit Rating: BBB-/Negative. Outlook slightly weak due to sector conditions.",
        "board_minutes.pdf": "Board discussion on Related Party Transactions with subsidiary entities.",
        "gst_3b.pdf": "GSTR-3B Filing for Dec 2025. Total tax liability: ₹12,00,000.",
        "shareholding_pattern.pdf": "Detailed shareholding pattern as per SEBI regulations."
    }
    
    for filename, content in files.items():
        with open(os.path.join(UPLOAD_DIR, filename), "w", encoding="utf-8") as f:
            f.write(content)

if __name__ == "__main__":
    generate_csvs()
    generate_mock_pdfs()
    print(f"Generated 12 sample files in {UPLOAD_DIR}")
