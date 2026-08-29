"""
Document storage and upload validation.

Uploads are the app's only untrusted input surface, so every file is checked
three ways before it is written: the extension must be on the allowlist, the
first bytes must match what the extension claims, and the stream is copied
under a hard size cap that aborts mid-write rather than after the fact.

Files are written under a per-case directory keyed on the case id, and the
resolved path is asserted to stay inside the upload root, so a crafted
filename cannot escape via '..' or an absolute path.
"""

from __future__ import annotations

import os
import shutil
import unicodedata
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, status

from app.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".csv", ".json"}

# Leading bytes each accepted format must start with. CSV and JSON are text,
# so they are validated by decodability rather than a fixed signature.
PDF_MAGIC = b"%PDF-"

CHUNK_SIZE = 64 * 1024


def _upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_filename(raw: str | None) -> str:
    """
    Reduce an uploaded filename to a flat, portable basename.

    os.path.basename alone is not enough on a POSIX server receiving a Windows
    path, because 'C:\\evil\\x.pdf' has no forward slash and survives intact.
    """
    candidate = raw or "unnamed"
    candidate = unicodedata.normalize("NFKD", candidate)
    candidate = candidate.replace("\\", "/").split("/")[-1]
    candidate = candidate.replace("\x00", "").strip()
    candidate = "".join(c for c in candidate if c.isprintable())

    # Strip anything that could be interpreted as a path or a hidden file.
    candidate = candidate.lstrip(". ")
    if not candidate:
        candidate = "unnamed"
    return candidate[:200]


def case_dir(app_id: int) -> Path:
    directory = _upload_root() / str(app_id)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def resolve_within_root(app_id: int, filename: str) -> Path:
    """Resolve a stored file path, refusing anything outside the upload root."""
    root = _upload_root()
    target = (root / str(app_id) / safe_filename(filename)).resolve()
    if not target.is_relative_to(root):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path."
        )
    return target


def validate_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"'{filename}' has an unsupported type. Accepted formats: "
                + ", ".join(sorted(ALLOWED_EXTENSIONS))
            ),
        )
    return extension


def _verify_magic(path: Path, extension: str, filename: str) -> None:
    """Confirm the bytes on disk match the type the extension claims."""
    with path.open("rb") as handle:
        head = handle.read(2048)

    if not head:
        _reject(path, f"'{filename}' is empty.")

    if extension == ".pdf" and not head.startswith(PDF_MAGIC):
        _reject(path, f"'{filename}' is not a valid PDF (missing %PDF- header).")

    if extension in (".csv", ".json"):
        try:
            text = head.decode("utf-8-sig")
        except UnicodeDecodeError:
            _reject(path, f"'{filename}' is not valid UTF-8 text.")
        if extension == ".json" and text.lstrip()[:1] not in ("{", "["):
            _reject(path, f"'{filename}' does not begin with a JSON object or array.")


def _reject(path: Path, message: str) -> None:
    path.unlink(missing_ok=True)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def save_upload(app_id: int, filename: str, source: BinaryIO) -> Path:
    """
    Stream one upload to disk under the size cap, then verify its signature.

    The cap is enforced while copying rather than by reading Content-Length,
    which a client controls and can lie about.
    """
    extension = validate_extension(filename)
    destination = resolve_within_root(app_id, filename)
    destination.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    try:
        with destination.open("wb") as buffer:
            while True:
                chunk = source.read(CHUNK_SIZE)
                if not chunk:
                    break
                written += len(chunk)
                if written > settings.MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=(
                            f"'{filename}' exceeds the "
                            f"{settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit."
                        ),
                    )
                buffer.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except OSError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not store '{filename}': {exc}",
        ) from exc

    _verify_magic(destination, extension, filename)
    return destination


def delete_file(app_id: int, filename: str) -> None:
    resolve_within_root(app_id, filename).unlink(missing_ok=True)


def delete_case_files(app_id: int) -> None:
    shutil.rmtree(_upload_root() / str(app_id), ignore_errors=True)


def file_size(path: Path) -> int:
    try:
        return os.path.getsize(path)
    except OSError:
        return 0
