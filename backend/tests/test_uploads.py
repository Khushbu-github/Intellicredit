"""
Upload validation.

Uploads are the only untrusted input surface in the application. Before this
work there was no size cap, no type allowlist and no content check, so any
file of any size could be written to the server's disk under a name the
client chose.
"""

import pytest
from fastapi import HTTPException

from app.config import settings
from app.services import storage


def _upload(client, case_id, headers, name, content, content_type="application/octet-stream"):
    return client.post(
        f"/api/applications/{case_id}/documents",
        files={"files": (name, content, content_type)},
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Filename handling
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("../../../etc/passwd", "passwd"),
        ("..\\..\\windows\\system32\\config", "config"),
        ("C:\\Users\\victim\\statement.pdf", "statement.pdf"),
        ("/absolute/path/report.pdf", "report.pdf"),
        ("....//....//escape.csv", "escape.csv"),
        (".hidden", "hidden"),
        ("", "unnamed"),
        (None, "unnamed"),
    ],
)
def test_filenames_are_reduced_to_a_flat_basename(raw, expected):
    """
    os.path.basename alone is not enough: a Windows-style path has no forward
    slash, so it survives intact on a POSIX server.
    """
    assert storage.safe_filename(raw) == expected


def test_resolved_paths_cannot_escape_the_upload_root():
    resolved = storage.resolve_within_root(7, "../../etc/passwd")
    assert resolved.name == "passwd"
    assert "7" in resolved.parts


# ---------------------------------------------------------------------------
# Type and content validation
# ---------------------------------------------------------------------------

def test_unsupported_extensions_are_refused(client, case_id, auth_headers):
    response = _upload(client, case_id, auth_headers, "payload.exe", b"MZ\x90\x00")
    assert response.status_code == 415


def test_a_renamed_executable_is_caught_by_the_magic_bytes(client, case_id, auth_headers):
    """A file called .pdf that is not a PDF must not reach the parser."""
    response = _upload(client, case_id, auth_headers, "invoice.pdf", b"MZ\x90\x00not-a-pdf")
    assert response.status_code == 400
    assert "%PDF-" in response.json()["detail"]


def test_a_real_pdf_header_is_accepted(client, case_id, auth_headers):
    response = _upload(
        client, case_id, auth_headers, "annual_report.pdf",
        b"%PDF-1.7\n% minimal placeholder\n",
    )
    assert response.status_code == 201


def test_empty_files_are_refused(client, case_id, auth_headers):
    response = _upload(client, case_id, auth_headers, "empty.csv", b"")
    assert response.status_code == 400


def test_binary_masquerading_as_csv_is_refused(client, case_id, auth_headers):
    response = _upload(client, case_id, auth_headers, "data.csv", b"\xff\xfe\x00\x01\x02")
    assert response.status_code == 400


def test_json_must_actually_be_json(client, case_id, auth_headers):
    response = _upload(client, case_id, auth_headers, "cibil.json", b"this is not json")
    assert response.status_code == 400


def test_oversized_uploads_are_refused_and_leave_nothing_behind(
    client, case_id, auth_headers, upload_dir
):
    oversized = b"%PDF-1.7\n" + b"x" * (settings.MAX_UPLOAD_BYTES + 1024)
    response = _upload(client, case_id, auth_headers, "huge.pdf", oversized)

    assert response.status_code == 413
    assert not (upload_dir / str(case_id) / "huge.pdf").exists()


def test_too_many_files_in_one_request_are_refused(client, case_id, auth_headers):
    files = [
        ("files", (f"gst_{i}.csv", b"Type,GSTIN,Amount\n", "text/csv"))
        for i in range(settings.MAX_FILES_PER_REQUEST + 1)
    ]
    response = client.post(
        f"/api/applications/{case_id}/documents", files=files, headers=auth_headers
    )
    assert response.status_code == 400


def test_validate_extension_raises_for_unknown_types():
    with pytest.raises(HTTPException) as exc:
        storage.validate_extension("archive.zip")
    assert exc.value.status_code == 415


# ---------------------------------------------------------------------------
# Stored documents are not publicly reachable
# ---------------------------------------------------------------------------

def test_uploaded_documents_are_not_served_from_a_static_mount(client, case_id, auth_headers):
    """
    The previous build mounted the upload directory at /files, so any caller
    who guessed a sequential case id could download a borrower's statements.
    """
    _upload(
        client, case_id, auth_headers, "bank_statement.csv",
        b"Date,Description,Amount,Type\n2026-01-01,TRF,100,CR\n", "text/csv",
    )
    assert client.get(f"/files/{case_id}/bank_statement.csv").status_code == 404


def test_download_requires_ownership(client, case_id, auth_headers, other_headers):
    _upload(
        client, case_id, auth_headers, "bank_statement.csv",
        b"Date,Description,Amount,Type\n2026-01-01,TRF,100,CR\n", "text/csv",
    )
    doc_id = client.get(
        f"/api/applications/{case_id}/documents", headers=auth_headers
    ).json()["documents"][0]["id"]

    path = f"/api/applications/{case_id}/documents/{doc_id}/download"
    assert client.get(path, headers=auth_headers).status_code == 200
    assert client.get(path, headers=other_headers).status_code == 404
    assert client.get(path).status_code == 401
