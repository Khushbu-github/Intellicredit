"""
End-to-end workflow through the HTTP API: create a case, upload documents,
score it, record field notes, simulate, and read the audit trail.
"""

GST_CSV = (
    b"Type,GSTIN,Amount,Date\n"
    b"Sale,27AAAAA0000A1Z5,500000,2026-01-01\n"
    b"Sale,27BBBBB1111B1Z2,300000,2026-01-05\n"
    b"Purchase,27AAAAA0000A1Z5,450000,2026-01-10\n"
    b"Purchase,27CCCCC2222C1Z3,200000,2026-01-15\n"
)

BANK_CSV = (
    b"Date,Description,Amount,Type\n"
    b"2026-02-01,TRF FROM CLIENT A,100000,CR\n"
    b"2026-02-05,CHQ RETURN - INSUFFICIENT FUNDS,50000,DR\n"
    b"2026-02-10,EMI HDFC BANK,25000,DR\n"
)

CIBIL_JSON = b'{"score": 742, "dpd_30": 1, "total_enquiries": 4}'

SHAREHOLDING_CSV = (
    b"Entity,Stake,Pledged\n"
    b"Promoter A,45,20\n"
    b"Public,55,0\n"
)


def _upload_pack(client, case_id, headers):
    return client.post(
        f"/api/applications/{case_id}/documents",
        files=[
            ("files", ("gst_returns.csv", GST_CSV, "text/csv")),
            ("files", ("bank_statement.csv", BANK_CSV, "text/csv")),
            ("files", ("cibil_commercial.json", CIBIL_JSON, "application/json")),
            ("files", ("shareholding_pattern.csv", SHAREHOLDING_CSV, "text/csv")),
        ],
        headers=headers,
    )


def test_meta_exposes_the_policy_the_ui_renders(client):
    body = client.get("/api/meta").json()
    assert body["policy"]["min_total_score"] == 60
    assert sum(body["pillar_weights"].values()) == 100
    assert ".pdf" in body["upload"]["allowed_extensions"]
    # No key is configured in tests, so the UI must be told to hide the panels.
    assert body["features"]["llm_assist"] is False


def test_health_check_responds(client):
    assert client.get("/health").json()["status"] == "ok"


def test_a_new_case_starts_pending_and_unscored(client, case_id, auth_headers):
    case = client.get(f"/api/applications/{case_id}/analysis", headers=auth_headers).json()
    assert case["status"] == "Pending"
    assert case["total_score"] is None


def test_full_upload_and_scoring_workflow(client, case_id, auth_headers):
    response = _upload_pack(client, case_id, auth_headers)
    assert response.status_code == 201, response.text

    body = response.json()
    assert body["parsed_count"] == 4
    assert body["decision"] in ("APPROVE", "REJECT", "REFER")

    case = client.get(f"/api/applications/{case_id}/analysis", headers=auth_headers).json()
    assert case["status"] == "Analyzed"
    assert case["total_score"] is not None
    assert case["score_breakdown"] and case["limit_working"] and case["covenants"]

    # Screening actually fired on the uploaded content.
    assert case["bounce_count"] >= 1                    # the cheque return
    assert case["gst_circular_trading_pct"] > 0         # the overlapping GSTIN
    assert case["cibil_score"] == 742


def test_documents_are_listed_with_their_provenance(client, case_id, auth_headers):
    _upload_pack(client, case_id, auth_headers)
    body = client.get(
        f"/api/applications/{case_id}/documents", headers=auth_headers
    ).json()

    assert body["count"] == 4
    for document in body["documents"]:
        assert document["parse_status"] == "parsed"
        assert document["doc_label"]
        # Every figure must be attributable; with no API key nothing is 'llm'.
        assert document["extraction_source"] == "regex"


def test_reuploading_the_same_filename_replaces_rather_than_duplicates(
    client, case_id, auth_headers
):
    _upload_pack(client, case_id, auth_headers)
    _upload_pack(client, case_id, auth_headers)
    body = client.get(
        f"/api/applications/{case_id}/documents", headers=auth_headers
    ).json()
    assert body["count"] == 4


def test_removing_a_document_rescores_the_case(client, case_id, auth_headers):
    _upload_pack(client, case_id, auth_headers)
    before = client.get(
        f"/api/applications/{case_id}/analysis", headers=auth_headers
    ).json()

    documents = client.get(
        f"/api/applications/{case_id}/documents", headers=auth_headers
    ).json()["documents"]
    bank = next(d for d in documents if d["doc_type"] == "bank")

    response = client.delete(
        f"/api/applications/{case_id}/documents/{bank['id']}", headers=auth_headers
    )
    assert response.status_code == 200 and response.json()["remaining"] == 3

    after = client.get(
        f"/api/applications/{case_id}/analysis", headers=auth_headers
    ).json()
    assert after["bounce_count"] == 0
    assert after["total_score"] != before["total_score"]


def test_reanalyze_requires_documents(client, case_id, auth_headers):
    assert client.post(
        f"/api/applications/{case_id}/reanalyze", headers=auth_headers
    ).status_code == 400


def test_field_notes_rescore_and_report_their_overrides(client, case_id, auth_headers):
    _upload_pack(client, case_id, auth_headers)
    before = client.get(
        f"/api/applications/{case_id}/analysis", headers=auth_headers
    ).json()["total_score"]

    response = client.post(
        f"/api/applications/{case_id}/primary-notes",
        json={
            "factory_capacity": 55.0,
            "qualitative_notes": "Plant is badly underutilised.",
            "mgmt_quality": 6,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["overrides"]
    assert body["new_total"] < before


def test_field_notes_reject_invalid_input(client, case_id, auth_headers):
    response = client.post(
        f"/api/applications/{case_id}/primary-notes",
        json={"factory_capacity": -5, "mgmt_quality": 99},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_simulation_needs_an_analysed_case_then_answers(client, case_id, auth_headers):
    assert client.post(
        f"/api/applications/{case_id}/simulate", json={"dscr": 2.0}, headers=auth_headers
    ).status_code == 400

    _upload_pack(client, case_id, auth_headers)
    response = client.post(
        f"/api/applications/{case_id}/simulate",
        json={"dscr": 2.5, "cibil_score": 850, "revenue": 400.0},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["decision"] in ("APPROVE", "REJECT", "REFER")
    assert body["baseline"]["decision"] is not None
    assert "gates" in body

    # Simulation must never persist.
    stored = client.get(
        f"/api/applications/{case_id}/analysis", headers=auth_headers
    ).json()
    assert stored["revenue"] != 400.0


def test_simulation_rejects_out_of_range_inputs(client, case_id, auth_headers):
    _upload_pack(client, case_id, auth_headers)
    response = client.post(
        f"/api/applications/{case_id}/simulate",
        json={"cibil_score": 5000}, headers=auth_headers,
    )
    assert response.status_code == 422


def test_the_audit_trail_records_every_scoring_run(client, case_id, auth_headers):
    _upload_pack(client, case_id, auth_headers)
    client.post(
        f"/api/applications/{case_id}/primary-notes",
        json={"factory_capacity": 70.0, "qualitative_notes": "Underutilised."},
        headers=auth_headers,
    )

    body = client.get(f"/api/applications/{case_id}/events", headers=auth_headers).json()
    assert body["count"] >= 2

    triggers = [e["trigger"] for e in body["events"]]
    assert "ingestion" in triggers and "primary_notes" in triggers
    for event in body["events"]:
        assert event["summary"] and event["detail"]["gates"]


def test_breakeven_reports_the_distance_to_each_gate(client, case_id, auth_headers):
    _upload_pack(client, case_id, auth_headers)
    body = client.get(
        f"/api/applications/{case_id}/breakeven", headers=auth_headers
    ).json()
    for gate in ("score", "dscr", "litigation"):
        assert "cleared" in body[gate]


def test_the_cam_downloads_as_a_word_document(client, case_id, auth_headers):
    _upload_pack(client, case_id, auth_headers)
    response = client.get(f"/api/applications/{case_id}/cam", headers=auth_headers)

    assert response.status_code == 200
    assert "wordprocessingml" in response.headers["content-type"]
    assert "CAM_" in response.headers["content-disposition"]
    assert response.content.startswith(b"PK")   # docx is a zip container


def test_model_assisted_routes_report_unavailable_without_a_key(
    client, case_id, auth_headers
):
    """
    With no ANTHROPIC_API_KEY the app must stay fully usable and say plainly
    that the optional features are off - not fail with a 500.
    """
    _upload_pack(client, case_id, auth_headers)

    assert client.post(
        f"/api/applications/{case_id}/narrative", headers=auth_headers
    ).status_code == 503
    assert client.post(
        f"/api/applications/{case_id}/chat",
        json={"question": "Why was this decision reached?"},
        headers=auth_headers,
    ).status_code == 503


def test_deleting_a_case_removes_its_documents_and_files(
    client, case_id, auth_headers, upload_dir
):
    _upload_pack(client, case_id, auth_headers)
    assert (upload_dir / str(case_id)).exists()

    assert client.delete(
        f"/api/applications/{case_id}", headers=auth_headers
    ).status_code == 200
    assert client.get(
        f"/api/applications/{case_id}/analysis", headers=auth_headers
    ).status_code == 404
    assert not (upload_dir / str(case_id)).exists()
