"""
ORM models.

A case (Application) belongs to exactly one User. Every read and write in the
API filters on that ownership, so one analyst can never see or delete another
analyst's borrower file.
"""

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


def utcnow() -> datetime:
    """Timezone-aware UTC. datetime.utcnow() is deprecated and returns naive."""
    return datetime.now(UTC)


class User(Base):
    """An analyst with access to their own portfolio of cases."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(320), unique=True, nullable=False, index=True)
    full_name = Column(String(160), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    applications = relationship(
        "Application", back_populates="owner", cascade="all, delete-orphan"
    )


class Application(Base):
    """A single corporate credit appraisal case."""

    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    company_name = Column(String(255), nullable=True)
    sector = Column(String(80), nullable=True, default="Manufacturing")
    status = Column(String(32), nullable=False, default="Pending")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    analysed_at = Column(DateTime(timezone=True), nullable=True)

    # --- Financial indicators (extracted, never defaulted) ---
    revenue = Column(Float, nullable=True)
    ebitda = Column(Float, nullable=True)
    dscr = Column(Float, nullable=True)
    interest_coverage = Column(Float, nullable=True)
    debt_equity = Column(Float, nullable=True)
    net_worth = Column(Float, nullable=True)

    # --- Ownership & security ---
    promoter_stake = Column(Float, nullable=True)      # 0-1
    promoter_pledge = Column(Float, nullable=True)     # 0-1 of promoter holding
    collateral_value = Column(Float, nullable=True)    # Rs Cr
    security_cover = Column(Float, nullable=True)      # x
    existing_limits = Column(Float, nullable=True)     # Rs Cr

    # --- Bureau & external ---
    cibil_score = Column(Integer, nullable=True)
    cibil_dpd_30 = Column(Integer, nullable=True)
    cibil_enquiries = Column(Integer, nullable=True)
    external_rating = Column(String(32), nullable=True)
    rating_outlook = Column(String(32), nullable=True)

    # --- 5Cs scores ---
    character_score = Column(Float, nullable=True)
    capacity_score = Column(Float, nullable=True)
    capital_score = Column(Float, nullable=True)
    collateral_score = Column(Float, nullable=True)
    conditions_score = Column(Float, nullable=True)
    total_score = Column(Float, nullable=True)
    risk_grade = Column(String(8), nullable=True)

    # --- Screening flags ---
    gst_circular_trading_pct = Column(Float, nullable=True)
    gst_turnover_mismatch_pct = Column(Float, nullable=True)
    litigation_count = Column(Integer, nullable=False, default=0)
    bounce_count = Column(Integer, nullable=False, default=0)
    related_party_flag = Column(Boolean, nullable=False, default=False)

    # --- Decision ---
    decision = Column(String(16), nullable=True)
    decision_reason = Column(Text, nullable=True)
    recommended_limit_cr = Column(Float, nullable=True)
    spread = Column(String(64), nullable=True)

    # --- Human-in-the-loop ---
    factory_capacity = Column(Float, nullable=True)
    mgmt_quality = Column(Integer, nullable=True)
    qualitative_notes = Column(Text, nullable=True)

    # --- Structured payloads consumed by the UI and the memo ---
    score_breakdown = Column(JSON, nullable=True)   # per-pillar component contributions
    limit_working = Column(JSON, nullable=True)     # the three limit constraints
    covenants = Column(JSON, nullable=True)         # covenants + conditions precedent
    research = Column(JSON, nullable=True)          # simulated MCA / litigation / news
    red_flags = Column(JSON, nullable=True)         # consolidated screening findings
    raw_data = Column(JSON, nullable=True)          # merged inputs, gates, coverage
    narrative = Column(JSON, nullable=True)         # LLM-drafted memo prose, if generated

    owner = relationship("User", back_populates="applications")
    documents = relationship(
        "Document", back_populates="application", cascade="all, delete-orphan"
    )
    events = relationship(
        "ScoreEvent", back_populates="application", cascade="all, delete-orphan"
    )


class Document(Base):
    """One uploaded file and what the ingestor got out of it."""

    __tablename__ = "documents"
    __table_args__ = (
        # Re-uploading the same filename updates the existing row rather than
        # adding a duplicate, so a case cannot double-count one legal notice.
        UniqueConstraint("application_id", "filename", name="uq_document_case_filename"),
    )

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(
        Integer, ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    filename = Column(String(255), nullable=False)
    stored_path = Column(String(512), nullable=True)
    content_type = Column(String(128), nullable=True)
    doc_type = Column(String(32), nullable=True)
    doc_type_source = Column(String(16), nullable=True)    # filename | content | llm
    size_bytes = Column(Integer, nullable=False, default=0)
    parsed = Column(Boolean, nullable=False, default=False)
    parse_status = Column(String(16), nullable=False, default="stored")
    parse_message = Column(Text, nullable=True)
    extracted = Column(JSON, nullable=True)
    extraction_source = Column(String(16), nullable=True)  # regex | llm | none
    uploaded_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    application = relationship("Application", back_populates="documents")


class ScoreEvent(Base):
    """An append-only record of every scoring run, for the audit trail."""

    __tablename__ = "score_events"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(
        Integer, ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    trigger = Column(String(32), nullable=True)   # ingestion | primary_notes | reanalysis
    summary = Column(Text, nullable=True)
    total_score = Column(Float, nullable=True)
    decision = Column(String(16), nullable=True)
    delta = Column(Float, nullable=True)
    detail = Column(JSON, nullable=True)

    application = relationship("Application", back_populates="events")
