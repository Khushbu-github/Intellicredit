# Intelli-Credit

**Next-Gen Corporate Credit Appraisal Engine — built for the Indian banking context.**

Intelli-Credit automates the front-end of corporate credit underwriting: it ingests a borrower's financial documents (annual reports, GST returns, bank statements, legal notices, sanction letters), extracts and cross-verifies the numbers, scores the proposal against the classic **5 Cs of Credit**, applies a rules-based approve/reject decision engine, and generates a bank-ready **Credit Appraisal Memo (CAM)** as a downloadable Word document — all through a single-page web app.

> **Design decisions, and what each was chosen over, are documented in [ARCHITECTURE.md](ARCHITECTURE.md).**

[![CI](https://github.com/Khushbu-github/IntelliCredit/actions/workflows/ci.yml/badge.svg)](https://github.com/Khushbu-github/IntelliCredit/actions/workflows/ci.yml)

---

## Table of Contents

- [What Problem It Solves](#what-problem-it-solves)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Where LLMs Are Used](#where-llms-are-used)
- [Scoring & Decision Logic](#scoring--decision-logic)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Setup & Run](#setup--run)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known Limitations & Roadmap](#known-limitations--roadmap)

---

## What Problem It Solves

In Indian corporate banking, a credit officer preparing a CAM manually has to:

1. Read annual reports, GST filings, and bank statements to pull out financial ratios.
2. Cross-check GST sales/purchase data for fraud patterns like circular trading.
3. Scan bank statements for cheque bounces and legal notices for pending litigation (e.g. NI Act §138 cases).
4. Score the borrower across the 5 Cs of Credit (Character, Capacity, Capital, Collateral, Conditions).
5. Apply internal policy rules to arrive at an Approve/Reject decision, a recommended limit, and a pricing spread.
6. Write it all up in a formatted CAM document.

Intelli-Credit automates steps 1–6 into a single workflow, turning a multi-hour manual process into a few minutes of document upload + review.

The governing constraint: **a credit decision must be explainable and reproducible.** Every score carries the evidence it was computed from, every decision names the policy gates it applied, and running the same case twice produces the same answer.

## Core Features

1. **Analyst accounts** — Registration and JWT-authenticated sign-in. Every case belongs to exactly one analyst; another analyst's case is indistinguishable from one that does not exist.
2. **Case portfolio** — Cases persist server-side and are listed, reopened and deleted from a portfolio screen. Every screen has its own URL, so cases are linkable and survive a refresh.
3. **Multi-format data ingestor** — Ten document types are parsed: annual reports, GST registers, bank statements, sanction letters, legal notices, rating reports, board minutes, shareholding patterns, ITR summaries and CIBIL commercial pulls (PDF with OCR fallback, CSV and JSON). Every file records what was extracted from it, *how* it was classified and *how* the figures were read.
4. **Cross-document verification** — Circular trading and counterparty concentration on the GST register, ITR-to-GST turnover reconciliation, cheque returns and observed debt service from bank flows, promoter share pledges, going-concern and audit-qualification flags, and related-party dealings from board minutes.
5. **Research layer** — Registry data (directors, DIN status, charges), court records, press sentiment and sector peer medians. Generated deterministically per borrower and labelled `simulated` everywhere it appears.
6. **5Cs scoring with component-level explainability** — Each pillar returns the components that produced it, every one carrying the evidence it was scored on and a flag for whether that evidence was actually present. An **evidence-coverage** figure reports how much of the score rests on real documents rather than assumptions.
7. **Decision engine with visible working** — Five policy gates, a limit sized against three independent methods (turnover, cash flow, collateral) with the binding constraint identified, risk-based pricing, and an internal risk grade.
8. **Covenant generation** — Financial covenants, conditions precedent and a monitoring schedule, each generated from the specific weakness in the case that it answers.
9. **What-if analysis** — Flex DSCR, revenue, EBITDA, collateral, litigation, promoter holding, bureau score or utilisation, and re-run the live decision engine without persisting anything. A break-even view shows the distance to each gate.
10. **Human-in-the-loop field notes** — Observed capacity utilisation is scored as a Capacity component through the model itself; keyword overrides are folded into the pillar scores *before* the decision engine runs, so a note that drops a case below the cut-off also re-sizes the limit and regenerates the covenants.
11. **Audit trail** — Every scoring run is recorded server-side as an append-only event with the gates it applied, the pillar figures and the score movement, written in the same transaction as the score itself.
12. **CAM generator** — An eight-section Word memo: recommendation and gates, financials with peer comparison, pillar-by-pillar scoring working, risk register with litigation and director detail, limit assessment, covenants, field notes and the processing history.
13. **Optional model assistance** — Extraction fallback for scanned reports, classification rescue for badly-named files, LLM-drafted memo narrative, and an analyst Q&A over the case. All four degrade to nothing when no API key is configured.

---

## Architecture

```
Browser (React 19 SPA, Vercel)
  React Router → pages → components
  TanStack Query owns all server state, caching and invalidation
  lib/api.ts — single fetch client, attaches the JWT
        │  HTTPS + Bearer token
        ▼
FastAPI (Render, Docker)
  api/routes  →  services  →  analysis / ingest / llm  →  policy
        │                              │
        ▼                              ▼
  Postgres (Supabase)          Anthropic API (optional)
  SQLAlchemy + Alembic         claude-opus-5
```

Dependencies point one way only. `analysis/` never imports from `api/` or `db/`, which is what makes the scoring engine testable as pure functions with no database, no HTTP and no mocks.

Full diagrams, the request lifecycle and the layering rationale are in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Tech Stack

### Backend

| Layer | Technology | Chosen over |
|---|---|---|
| Language / Runtime | Python 3.12 | — (the document-parsing and tabular ecosystem is Python's) |
| Web framework | FastAPI + Uvicorn | Django REST Framework, Flask — for dependency injection, which makes authorisation structural |
| Validation | Pydantic v2 + pydantic-settings | hand-rolled validation |
| ORM | SQLAlchemy 2.0 | Django ORM, raw SQL |
| Migrations | Alembic | a hand-rolled migrator that could only add columns |
| Database | PostgreSQL (SQLite for local/tests) | MongoDB — the data is strongly relational; JSONB covers the document-shaped parts |
| Auth | PyJWT + bcrypt | server-side sessions (cross-origin), hosted IdP (hides the mechanism), passlib (unmaintained) |
| PDF parsing | pypdf | PyPDF2 (archived in 2023) |
| OCR | pytesseract + Pillow + Tesseract | — |
| Tabular analysis | pandas | — |
| Document generation | python-docx | — |
| Model assistance | anthropic (`claude-opus-5`) | — (optional; the app runs fully without it) |
| Testing | pytest + pytest-cov | — |
| Linting | Ruff | flake8 + isort + pyupgrade |
| Containerization | Docker (`python:3.12-slim` + `tesseract-ocr`, non-root) | — |

### Frontend

| Layer | Technology | Chosen over |
|---|---|---|
| Framework | React 19 + TypeScript 5.9 | — |
| Build tool | Vite 7 | Create React App (deprecated), Next.js (SSR/SEO earn nothing behind a login) |
| Routing | React Router 7 | screen state in `useState` — which made cases unlinkable |
| Server state | TanStack Query 5 | Redux Toolkit / Zustand — those solve *client* state; this app's state is nearly all server state |
| Styling | Tailwind CSS 3 + PostCSS | — |
| Linting | ESLint 9 + typescript-eslint | — |
| Containerization | Docker (multi-stage `node:20-alpine` → `serve`) | — |

### Infrastructure

- **Docker Compose** for local development — Postgres, backend with hot reload, frontend with hot reload.
- **GitHub Actions CI** — lint, migrations, backend tests with a coverage floor, frontend typecheck and build, and both Docker image builds.
- **Deployment** — backend on Render (Docker, migrations at boot, `/health` probe), frontend on Vercel (static SPA with a rewrite so deep links survive refresh), database on Supabase Postgres.

---

## Where LLMs Are Used

**The scoring and decision engine contains no LLM.** A bank cannot defend "the model approved it"; it can defend "the policy engine approved it, deterministically, and here is the working."

The model is used in exactly four places, each with a deterministic path in front of it and a guardrail behind it:

| Use | When it runs | Guardrail |
|---|---|---|
| **Extraction fallback** | Only when the regex parsers find no figures in an annual report | Every field optional; instructed to omit rather than estimate; results tagged `extraction_source="llm"` |
| **Classification fallback** | Only after filename rules *and* CSV column sniffing fail | Closed set of types; must return `unclassified` below 0.7 confidence |
| **CAM narrative** | On explicit request, after scoring | The decision and figures are already fixed; the model writes prose around them and may not restate or contradict a number |
| **Analyst chat** | On explicit request | Answers only from the case record; cannot offer a competing recommendation; question is delimited against prompt injection |

With `ANTHROPIC_API_KEY` unset, every call returns `None`, the deterministic path continues, and `/api/meta` reports `features.llm_assist: false` so the UI hides the optional panels.

---

## Scoring & Decision Logic

### Pillar weights

| Pillar | Weight | Measures |
|---|---|---|
| Character | 25 | Willingness to pay — bureau score, repayment conduct, litigation, cheque returns, governance |
| Capacity | 30 | Ability to pay — DSCR, interest coverage, operating margin, capacity utilisation |
| Capital | 20 | Skin in the game — leverage, net worth, promoter stake and pledge |
| Collateral | 15 | Security — collateral value, security cover, charges created |
| Conditions | 10 | External environment — sector outlook, external rating, press sentiment |

Every component reports the evidence it was scored on and whether that evidence was present. **Missing evidence scores at half the component maximum and is marked `evidenced: false`** — absent data is neither rewarded nor treated as proof of failure, because rejecting a borrower for paperwork the bank never asked for is not a defensible decision.

### Policy gates

All constants live in [`backend/app/analysis/policy.py`](backend/app/analysis/policy.py) — one source of truth, read by the scorer, the engine, the override path and the `/meta` endpoint the UI renders from.

| Gate | Threshold | Severity |
|---|---|---|
| Composite score | ≥ 60 | Critical |
| DSCR | ≥ 1.10x | Critical |
| Litigation | < 3 adverse matters | Critical |
| GST circular trading | ≤ 20% counterparty overlap | Critical |
| Promoter pledge | ≤ 50% of holding | Warning (conditions the sanction) |

### Limit sizing

Three independent methods; the tightest binds:

- **Turnover method** — 25% of annual turnover (Nayak-committee style)
- **Cash flow method** — EBITDA discounted to 1.25x coverage
- **Collateral method** — 70% advance against security

A method whose inputs are missing is marked `available: false`, not sized at zero. If none can be computed the decision is `REFER`, not `APPROVE`.

---

## Project Structure

```
IntelliCredit/
├── ARCHITECTURE.md              Design decisions and rejected alternatives
├── docker-compose.yml           Local dev: Postgres + backend + frontend
├── render.yaml                  Render deployment blueprint
├── .github/workflows/ci.yml     Lint, migrations, tests, builds
│
├── backend/
│   ├── Dockerfile               python:3.12-slim + tesseract, non-root
│   ├── requirements.txt         Pinned runtime dependencies
│   ├── requirements-dev.txt     + pytest, ruff
│   ├── pyproject.toml           pytest, coverage and ruff config
│   ├── alembic.ini
│   ├── alembic/                 Versioned schema migrations
│   ├── scripts/
│   │       └── generate_demo_data.py   Three borrower packs (approve / refer / reject)
│   ├── tests/                   166 tests
│   └── app/
│       ├── main.py              App factory, CORS, router registration
│       ├── config.py            Environment-driven settings
│       ├── api/
│       │   ├── deps.py          get_db, get_current_user, ownership-checked get_case
│       │   └── routes/          auth · applications · documents · cam · chat · meta
│       ├── core/security.py     bcrypt hashing, JWT issue/decode
│       ├── db/                  Engine, session, ORM models
│       ├── schemas/             Pydantic request/response models
│       ├── services/
│       │   ├── pipeline.py      Classification, ingestion, whole-case recompute
│       │   ├── storage.py       Upload validation and safe file handling
│       │   └── case_service.py  Recompute + audit event, one transaction
│       ├── analysis/
│       │   ├── policy.py        Every policy constant, in one place
│       │   ├── five_cs.py       Weighted scoring with component evidence
│       │   └── decision_engine.py  Gates, limit sizing, pricing, covenants
│       ├── ingest/              PDF/OCR, GST, bank, shareholding, ITR, CIBIL parsers
│       ├── llm/                 Optional: extraction, classification, narrative, chat
│       ├── research/            Simulated MCA / litigation / news / peer data
│       └── cam/generator.py     python-docx memo builder
│
└── frontend/
    ├── Dockerfile               Multi-stage build → static serve
    ├── vercel.json              SPA rewrite so deep links survive refresh
    └── src/
        ├── main.tsx             QueryClient + Router providers
        ├── App.tsx              Route table only
        ├── pages/               AuthPage · PortfolioPage · NewCasePage · CaseWorkspace
        ├── hooks/queries.ts     Every server read and mutation
        ├── lib/
        │   ├── api.ts           Single typed fetch client, attaches the JWT
        │   ├── auth.tsx         AuthProvider
        │   └── authContext.ts   Context + useAuth
        ├── components/          Dashboard, UploadZone, Simulator, CAM, ExplainTrail…
        └── types/credit.ts      Shared API types
```

---

## API Reference

All routes are prefixed `/api`. Everything except `/api/meta` and the auth endpoints requires an `Authorization: Bearer <token>` header. Interactive docs are at `/docs` when the server is running.

### Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Create an analyst account; returns a token |
| `POST` | `/auth/login` | OAuth2 password flow (form fields `username`, `password`) |
| `GET`  | `/auth/me` | The signed-in analyst |

### Cases

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/meta` | Policy constants, sectors, document types, upload limits, feature flags |
| `GET`    | `/applications` | The caller's portfolio |
| `POST`   | `/applications` | Register a borrower |
| `DELETE` | `/applications/{id}` | Delete a case, its documents and its files |
| `GET`    | `/applications/{id}/analysis` | The full scored case record |
| `POST`   | `/applications/{id}/reanalyze` | Re-score against documents on file |
| `GET`    | `/applications/{id}/events` | Append-only audit trail |
| `GET`    | `/applications/{id}/breakeven` | Distance to each policy gate |
| `POST`   | `/applications/{id}/primary-notes` | Field observations; re-scores the case |
| `POST`   | `/applications/{id}/simulate` | What-if analysis; persists nothing |

### Documents

| Method | Path | Purpose |
|---|---|---|
| `POST`   | `/applications/{id}/documents` | Upload and ingest; re-scores the case |
| `GET`    | `/applications/{id}/documents` | Files with extraction provenance |
| `GET`    | `/applications/{id}/documents/{doc_id}/download` | Authenticated download |
| `DELETE` | `/applications/{id}/documents/{doc_id}` | Remove and re-score without it |

### Output and model assistance

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/applications/{id}/cam` | The CAM as a `.docx` stream |
| `POST` | `/applications/{id}/narrative` | LLM-drafted memo prose, rendered into the .docx (503 if unconfigured) |
| `POST` | `/applications/{id}/chat` | Ask a question about the case (503 if unconfigured) |
| `GET`  | `/health` | Liveness probe |

---

## Setup & Run

### Option A — Docker Compose (recommended)

Brings up Postgres, the API and the frontend together, with migrations applied automatically.

```bash
git clone https://github.com/Khushbu-github/IntelliCredit.git
cd IntelliCredit

# Optional — enables the model-assisted features
export ANTHROPIC_API_KEY=sk-ant-...

docker compose up --build
```

- Frontend → <http://localhost:3000>
- API docs → <http://localhost:8000/docs>

### Option B — Run locally

**Backend** (Python 3.12):

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt

cp .env.example .env
# Generate a real secret:
python -c "import secrets; print(secrets.token_urlsafe(48))"
# Paste it into .env as SECRET_KEY. Leave DATABASE_URL on SQLite for local work.

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend** (Node 20+):

```bash
cd frontend
npm install
cp .env.example .env.local        # VITE_API_URL=http://localhost:8000/api
npm run dev                       # → http://localhost:5173
```

**Sample documents** — `python scripts/generate_demo_data.py` writes three
complete borrower packs into `backend/samples/`, chosen so the engine reaches a
different verdict on each:

| Pack | Borrower | Demonstrates |
|---|---|---|
| `strong_borrower/` | Vishwakarma Steel Ltd | Clears every gate → **APPROVE**, sized and priced |
| `thin_file_borrower/` | Meghna Textiles Pvt Ltd | Good conduct, but no audited financials or security valuation → **REFER**, because no limit can be sized |
| `distressed_borrower/` | Ashwin Infra Ltd | Circular trading, ITR/GST turnover gap, cheque returns, NI Act §138 matter, 78% promoter pledge, going-concern doubt and a qualified audit opinion → **REJECT** |

The PDFs are real PDFs, not renamed text files — the upload endpoint verifies
leading bytes against the extension, so renamed text would be rejected.
`tests/test_demo_packs.py` drives all three through the API and asserts each
reaches its intended verdict, so a scoring change that breaks the demo fails
the build instead.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SECRET_KEY` | **Yes in production** | Startup fails if left at the development default |
| `DATABASE_URL` | No (defaults to SQLite) | Postgres: `postgresql+psycopg://user:pass@host:6543/db` |
| `ALLOWED_ORIGINS` | No | Comma-separated; Vercel previews match by regex |
| `ANTHROPIC_API_KEY` | No | Absent → model features disabled, app fully functional |
| `UPLOAD_DIR`, `MAX_UPLOAD_BYTES` | No | Sensible defaults |

`.env` is gitignored. `.env.example` in each of `backend/` and `frontend/` documents the shape.

---

## Testing

```bash
cd backend
pytest                                        # 166 tests
pytest --cov=app --cov-report=term-missing    # 89% coverage
ruff check app tests                          # lint

cd ../frontend
npm run lint
npm run build                                 # includes tsc -b
```

The suites cover the decision engine and 5Cs scoring (golden tests naming the policy each protects), the ingestion pipeline, every document parser, upload validation and path-traversal handling, authentication, tenant isolation, and the whole workflow end-to-end over HTTP. No test calls the Anthropic API.

---

## Deployment

| Piece | Platform | Notes |
|---|---|---|
| Frontend | Vercel | `VITE_API_URL` set to the API's `/api` URL at build time |
| Backend | Render | Docker; `alembic upgrade head` runs at boot; health check `/health` |
| Database | Supabase Postgres | Use the **pooled** connection string (port 6543) with the `+psycopg` driver suffix |

Set `SECRET_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS` and optionally `ANTHROPIC_API_KEY` as environment variables on the platform — never in the repository. [`render.yaml`](render.yaml) makes the backend service reproducible.

---

## Known Limitations & Roadmap

Stated plainly, because knowing where the edges are is part of the design.

1. **The research layer is simulated.** MCA registry data, court records, press sentiment and peer medians are generated deterministically per borrower and labelled `simulated` everywhere they surface. Real MCA/CIBIL integrations need commercial agreements.
2. **Uploaded files live on the container filesystem**, so they do not survive a redeploy even though the database now does. Object storage is the next step; `services/storage.py` exists as the seam so that swap touches one module.
3. **Ingestion is synchronous.** It runs in a threadpool rather than on the event loop, so it no longer blocks other requests, but a large scanned PDF still makes the caller wait. A task queue with a `202 Accepted` response is the correct next step.
4. **Scoring is rules-based, not learned** — deliberately, since the rules are explainable and there is no labelled default history to fit against, but the weights are expert judgement rather than fitted parameters.
5. **No rate limiting** on the authentication endpoints.
6. **Single-role users** — no maker/checker separation, which a real sanctioning workflow requires.
