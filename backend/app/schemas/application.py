"""Request/response models for cases, documents and the audit trail."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApplicationCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    sector: str = Field(default="Manufacturing", max_length=80)


class ApplicationSummary(BaseModel):
    """Compact shape for the portfolio list."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str | None = None
    sector: str | None = None
    status: str
    created_at: datetime
    analysed_at: datetime | None = None
    total_score: float | None = None
    risk_grade: str | None = None
    decision: str | None = None
    recommended_limit_cr: float | None = None
    document_count: int = 0


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    doc_type: str | None = None
    doc_label: str | None = None
    doc_type_source: str | None = None
    size_bytes: int
    parse_status: str
    parse_message: str | None = None
    extraction_source: str | None = None
    uploaded_at: datetime
    extracted: dict[str, Any] = Field(default_factory=dict)


class ScoreEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    at: datetime
    trigger: str | None = None
    summary: str | None = None
    total_score: float | None = None
    decision: str | None = None
    delta: float | None = None
    detail: dict[str, Any] | None = None


class PrimaryNotesUpdate(BaseModel):
    factory_capacity: float = Field(ge=0, le=200)
    qualitative_notes: str | None = Field(default=None, max_length=5000)
    mgmt_quality: int | None = Field(default=None, ge=1, le=10)


class SimulationRequest(BaseModel):
    """Every field optional: only the ones supplied override the baseline."""

    dscr: float | None = Field(default=None, ge=0, le=20)
    revenue: float | None = Field(default=None, ge=0)
    ebitda: float | None = Field(default=None)
    collateral_value: float | None = Field(default=None, ge=0)
    promoter_stake: float | None = Field(default=None, ge=0, le=1)
    litigation_count: int | None = Field(default=None, ge=0, le=100)
    factory_capacity: float | None = Field(default=None, ge=0, le=200)
    cibil_score: int | None = Field(default=None, ge=0, le=900)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
