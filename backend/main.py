from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import os
import shutil
import pandas as pd
import json

from database import Application, get_db
from ingest.pdf_parser import extract_text_from_pdf, parse_financials, parse_sanction_letter, parse_legal_notice
from ingest.gst_analyzer import analyze_gst, analyze_bank_statement
from analysis.five_cs import calculate_5cs_scores
from analysis.decision_engine import decide_application
from research.mock_research import fetch_mca_data, fetch_litigation_data, fetch_news_sentiment
from cam.generator import generate_cam_docx

app = FastAPI(title="Intelli-Credit Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://intellicredit-lilac.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "files"
os.makedirs(UPLOAD_DIR, exist_ok=True)

try:
    from pydantic import BaseModel
except ImportError:
    from pydantic.v1 import BaseModel

class ApplicationCreate(BaseModel):
    company_name: str

@app.post("/api/applications")
async def create_application(data: ApplicationCreate, db: Session = Depends(get_db)):
    new_app = Application(company_name=data.company_name)
    db.add(new_app)
    db.commit()
    db.refresh(new_app)
    return {"app_id": new_app.id}

@app.post("/api/{app_id}/upload")
async def upload_files(app_id: int, files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    print(f"DEBUG: Received upload request for app_id: {app_id}")
    app_record = db.query(Application).filter(Application.id == app_id).first()
    if not app_record:
        print(f"DEBUG: Application {app_id} not found")
        raise HTTPException(status_code=404, detail="Application not found")
    
    app_folder = os.path.join(UPLOAD_DIR, str(app_id))
    os.makedirs(app_folder, exist_ok=True)
    
    parsed_data = {}
    print(f"DEBUG: Processing {len(files)} files")
    
    for file in files:
        filename = file.filename
        file_path = os.path.join(app_folder, filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Ingest logic
        if filename.endswith(".pdf"):
            with open(file_path, "rb") as f:
                raw_text = extract_text_from_pdf(f.read())
                if "annual" in filename.lower():
                    parsed_data.update(parse_financials(raw_text))
                elif "sanction" in filename.lower():
                    parsed_data.update(parse_sanction_letter(raw_text))
                elif "legal" in filename.lower():
                    res = parse_legal_notice(raw_text)
                    app_record.litigation_count += 1 if res["is_ni_138"] else 0
        
        elif filename.endswith(".csv"):
            df = pd.read_csv(file_path)
            if "gst" in filename.lower():
                gst_res = analyze_gst(df)
                app_record.gst_circular_trading_pct = gst_res["circular_trading_pct"]
                parsed_data.update(gst_res)
            elif "bank" in filename.lower():
                bank_res = analyze_bank_statement(df)
                if bank_res["bounce_count"] > 0:
                    app_record.litigation_count += bank_res["bounce_count"]
                parsed_data.update(bank_res)
    
    # Apply 5Cs Scoring
    research_mca = fetch_mca_data("ABC Ltd")
    research_lit = fetch_litigation_data("ABC Ltd")
    
    merged_data = {
        **parsed_data,
        "mca_red_flags": research_mca["red_flags"],
        "litigation_count": app_record.litigation_count,
        "dscr": parsed_data.get("dscr", 1.0)
    }
    
    scores = calculate_5cs_scores(merged_data)
    app_record.character_score = scores["character"]
    app_record.capacity_score = scores["capacity"]
    app_record.capital_score = scores["capital"]
    app_record.collateral_score = scores["collateral"]
    app_record.conditions_score = scores["conditions"]
    app_record.total_score = scores["total"]
    
    # Decision Engine
    decision = decide_application(scores, merged_data)
    app_record.decision = decision["decision"]
    app_record.decision_reason = decision["reason"]
    app_record.recommended_limit_cr = decision["recommended_limit_cr"]
    app_record.spread = decision["spread"]
    
    app_record.status = "Analyzed"
    db.commit()
    
    return {"status": "success", "scores": scores, "decision": decision}

@app.get("/api/{app_id}/analysis")
async def get_analysis(app_id: int, db: Session = Depends(get_db)):
    app_record = db.query(Application).filter(Application.id == app_id).first()
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found")
    return app_record

@app.post("/api/{app_id}/primary-notes")
async def update_primary_notes(
    app_id: int, 
    factory_capacity: float = Form(...), 
    qualitative_notes: str = Form(None),
    db: Session = Depends(get_db)
):
    print(f"DEBUG: Received primary-notes update for app_id: {app_id}")
    app_record = db.query(Application).filter(Application.id == app_id).first()
    if not app_record:
         raise HTTPException(status_code=404, detail="Application not found")
    
    # Base capacity adjustment
    if factory_capacity < 0.6:
        app_record.capacity_score = max(0, app_record.capacity_score - 15)
    
    # Qualitative "AI" Logic (Nuanced adjustment)
    if qualitative_notes:
        notes_lower = qualitative_notes.lower()
        if "40%" in notes_lower or "underutil" in notes_lower:
            app_record.capacity_score = max(0, app_record.capacity_score - 20)
            app_record.decision = "REJECT"
            app_record.decision_reason += " | Capacity downgraded due to factory note: underutilization."
        
        if "management" in notes_lower and ("poor" in notes_lower or "bad" in notes_lower):
            app_record.character_score = max(0, app_record.character_score - 20)
            app_record.decision = "REJECT"
            app_record.decision_reason += " | Character downgraded due to management concerns."
            
    # Recalculate total
    app_record.total_score = (
        app_record.character_score + 
        app_record.capacity_score + 
        app_record.capital_score + 
        app_record.collateral_score + 
        app_record.conditions_score
    )
        
    db.commit()
    return {"status": "success", "new_total": app_record.total_score}

@app.get("/api/{app_id}/cam")
async def get_cam(app_id: int, db: Session = Depends(get_db)):
    app_record = db.query(Application).filter(Application.id == app_id).first()
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found")
    
    # Dict representation for generator
    app_dict = {c.name: getattr(app_record, c.name) for c in app_record.__table__.columns}
    
    docx_stream = generate_cam_docx(app_dict)
    
    return StreamingResponse(
        docx_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=CAM_{app_id}.docx"}
    )

app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
