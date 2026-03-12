from sqlalchemy import create_engine, Column, Integer, String, Float, Text, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=True)
    status = Column(String, default="Pending")
    
    # Financial indicators
    revenue = Column(Float, nullable=True)
    ebitda = Column(Float, nullable=True)
    dscr = Column(Float, nullable=True)
    
    # 5Cs Analysis
    character_score = Column(Float, nullable=True)
    capacity_score = Column(Float, nullable=True)
    capital_score = Column(Float, nullable=True)
    collateral_score = Column(Float, nullable=True)
    conditions_score = Column(Float, nullable=True)
    total_score = Column(Float, nullable=True)
    
    # Flags/Decisions
    gst_circular_trading_pct = Column(Float, nullable=True)
    litigation_count = Column(Integer, default=0)
    decision = Column(String, nullable=True)
    decision_reason = Column(Text, nullable=True)
    recommended_limit_cr = Column(Float, nullable=True)
    spread = Column(String, nullable=True)
    
    raw_data = Column(JSON, nullable=True)

Base.metadata.create_all(bind=engine)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
