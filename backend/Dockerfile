# Python 3.12: current, supported until 2028, and compatible with Pydantic v2
# and pandas 2.x. The previous 3.9 pin was what forced the pydantic<2.0 cap.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# tesseract-ocr is the OCR engine pytesseract shells out to for scanned PDFs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Copied before the source so the dependency layer is cached across code edits.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Never run as root in a container that accepts file uploads.
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/files \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Render injects $PORT. Migrations run at boot so a deploy can never serve a
# schema older than the code that was just shipped.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
