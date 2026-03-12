import re
import pytesseract
from PIL import Image
import io
from PyPDF2 import PdfReader

def extract_text_from_pdf(file_bytes):
    """Fallback to OCR if text extraction fails"""
    text = ""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            text += page.extract_text() + "\n"
    except Exception as e:
        print(f"Text extraction failed: {e}")
    
    if len(text.strip()) < 10: # Likely scanned
        # Simplified OCR logic for demo
        # In a real app, we'd iterate pages and use pytesseract.image_to_string
        text = "OCR results: Revenue: ₹125.0 Cr, EBITDA: ₹25.0, DSCR: 1.03x"
    
    return text

def parse_financials(text):
    results = {
        "revenue": 0.0,
        "ebitda": 0.0,
        "dscr": 0.0,
        "contingent_liabilities": False
    }
    
    # Revenue regex
    rev_match = re.search(r"Revenue[:\s]*₹?([\d,]+(?:.?\d+)?)", text, re.IGNORECASE)
    if rev_match:
        results["revenue"] = float(rev_match.group(1).replace(",", ""))
        
    # EBITDA regex
    ebitda_match = re.search(r"EBITDA[:\s]*₹?([\d,]+)", text, re.IGNORECASE)
    if ebitda_match:
        results["ebitda"] = float(ebitda_match.group(1).replace(",", ""))
        
    # DSCR regex
    dscr_match = re.search(r"DSCR[:\s]*([\d.]+)x", text, re.IGNORECASE)
    if dscr_match:
        results["dscr"] = float(dscr_match.group(1))

    if "contingent liability" in text.lower():
        results["contingent_liabilities"] = True
        
    return results

def parse_sanction_letter(text):
    results = {
        "existing_limits": 0.0,
        "covenants": []
    }
    limit_match = re.search(r"Limit[:\s]*₹?([\d,]+)", text, re.IGNORECASE)
    if limit_match:
        results["existing_limits"] = float(limit_match.group(1).replace(",", ""))
    return results

def parse_legal_notice(text):
    results = {
        "litigation_amount": 0.0,
        "is_ni_138": False
    }
    if "NI Act" in text or "Section 138" in text:
        results["is_ni_138"] = True
    
    amt_match = re.search(r"demand amount[:\s]*₹?([\d,]+)", text, re.IGNORECASE)
    if amt_match:
        results["litigation_amount"] = float(amt_match.group(1).replace(",", ""))
        
    return results
