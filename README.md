# Intelli-Credit

Next-Gen Corporate Credit Appraisal Engine (Indian Banking Context).

## Hackathon Features
1. **Data Ingestor**: PDF OCR & GST vs Bank Circular Trading detection.
2. **Research Agent**: MCA Filings & News + Litigation.
3. **Recommendation**: 5Cs Scoring & CAM Word Generator + Decision Logic.

## Setup & Run

### Prerequisites
- Docker & Docker Compose
- Tesseract OCR installed on your host (if running locally without Docker)
- Node.js 18+ & Python 3.10+ (if running locally)

### Environment
1. Ensure `demo_data_generator.py` is run to get sample files.
2. `docker-compose up --build` or run manually via `npm run dev` and `uvicorn main:app --reload`.

### Using the App
- Go to `http://localhost:3000`.
- Upload documents (Annual Report, GST, Bank Statements, Legal Notices).
- Watch the analysis run and the 5Cs score populate.
- Download the generated CAM `.docx`.
