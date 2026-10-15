"""
Document upload, listing, download and removal.

Uploaded files are borrower financials, so they are never served from a
static mount. Every download goes through this router, which resolves the
document via the ownership-checked case dependency first.
"""

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import DbSession, OwnedCase
from app.config import settings
from app.core.rate_limit import limiter
from app.db.models import Document, utcnow
from app.schemas.application import DocumentRead
from app.services import storage
from app.services.case_service import run_recompute
from app.services.pipeline import DOC_LABELS, classify, ingest_document

router = APIRouter(prefix="/applications/{app_id}/documents", tags=["documents"])

# Nested payloads the case-level views render separately; listing them again
# per document would bloat the response for no benefit.
_BULKY_KEYS = ("red_flags", "bounces", "holders", "overlapping_gstins")


def _to_read_model(doc: Document) -> DocumentRead:
    model = DocumentRead.model_validate(doc)
    model.doc_label = DOC_LABELS.get(doc.doc_type, doc.doc_type)
    model.extracted = {
        k: v for k, v in (doc.extracted or {}).items() if k not in _BULKY_KEYS
    }
    return model


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_UPLOAD)
def upload_files(
    request: Request,
    response: Response,
    case: OwnedCase,
    db: DbSession,
    files: list[UploadFile] = File(...),
) -> dict:
    """
    Store and parse the uploaded documents, then recompute the whole case.

    Declared `def` rather than `async def` deliberately: this handler does
    blocking work - disk writes, PyPDF2, Tesseract OCR, pandas - and FastAPI
    runs sync handlers in a threadpool. As `async def` a single scanned PDF
    hitting the OCR path would block the event loop and stall every other
    request for its duration.

    Re-uploading a file with the same name replaces the earlier record rather
    than adding a duplicate, so the case cannot double-count one legal notice.

    Rate limited per user: OCR and parsing are the most CPU-expensive work
    the API does, and on a single small instance a determined uploader
    would starve every other request.
    """
    if len(files) > settings.MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {settings.MAX_FILES_PER_REQUEST} files per upload.",
        )

    ingested = []
    for upload in files:
        filename = storage.safe_filename(upload.filename)
        path = storage.save_upload(case.id, filename, upload.file)

        result = ingest_document(str(path), filename, classify(filename))

        existing = (
            db.query(Document)
            .filter(Document.application_id == case.id, Document.filename == filename)
            .first()
        )
        document = existing or Document(application_id=case.id, filename=filename)
        document.stored_path = str(path)
        document.content_type = upload.content_type
        document.doc_type = result.doc_type
        document.doc_type_source = result.doc_type_source
        document.size_bytes = storage.file_size(path)
        document.parsed = result.status == "parsed"
        document.parse_status = result.status
        document.parse_message = result.message
        document.extracted = result.extracted
        document.extraction_source = result.extraction_source
        document.uploaded_at = utcnow()
        if existing is None:
            db.add(document)

        ingested.append({
            "filename": filename,
            "doc_type": result.doc_type,
            "doc_label": DOC_LABELS.get(result.doc_type, result.doc_type),
            "doc_type_source": result.doc_type_source,
            "extraction_source": result.extraction_source,
            "parse_status": result.status,
            "message": result.message,
        })

    db.commit()
    run_recompute(db, case, trigger="ingestion")

    return {
        "status": "success",
        "ingested": ingested,
        "parsed_count": sum(1 for i in ingested if i["parse_status"] == "parsed"),
        "total_score": case.total_score,
        "risk_grade": case.risk_grade,
        "decision": case.decision,
    }


@router.get("", response_model=dict)
def list_documents(case: OwnedCase, db: DbSession) -> dict:
    """Every uploaded file with what the ingestor got out of it."""
    documents = (
        db.query(Document)
        .filter(Document.application_id == case.id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )
    return {"count": len(documents), "documents": [_to_read_model(d) for d in documents]}


@router.get("/{doc_id}/download")
def download_document(doc_id: int, case: OwnedCase, db: DbSession) -> FileResponse:
    """
    Serve one stored file to its owner.

    This replaces a StaticFiles mount over the upload directory, which served
    every borrower's annual report and bank statement to anyone who guessed a
    path - and case ids are sequential integers, so guessing was trivial.
    """
    document = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.application_id == case.id)
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found on this case."
        )

    path = storage.resolve_within_root(case.id, document.filename)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="The stored file is no longer available.",
        )

    return FileResponse(
        path,
        filename=document.filename,
        media_type=document.content_type or "application/octet-stream",
    )


@router.delete("/{doc_id}")
def delete_document(doc_id: int, case: OwnedCase, db: DbSession) -> dict:
    """Remove one document and re-score the case without it."""
    document = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.application_id == case.id)
        .first()
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found on this case."
        )

    filename = document.filename
    db.delete(document)
    db.commit()
    storage.delete_file(case.id, filename)

    remaining = db.query(Document).filter(Document.application_id == case.id).all()
    if remaining:
        run_recompute(db, case, trigger="reanalysis", documents=remaining)

    return {"status": "deleted", "filename": filename, "remaining": len(remaining)}
