# IntelliCredit — Architecture and Design Decisions

This document explains how the system is put together and, for every
significant choice, what it was chosen *over* and why. It is written to be read
end-to-end by someone who has never seen the codebase.

---

## Table of contents

- [1. What the system does](#1-what-the-system-does)
- [2. System architecture](#2-system-architecture)
- [3. Request lifecycle](#3-request-lifecycle)
- [4. The scoring domain](#4-the-scoring-domain)
- [5. Where LLMs are used — and where they are not](#5-where-llms-are-used--and-where-they-are-not)
- [6. Technology choices and the alternatives rejected](#6-technology-choices-and-the-alternatives-rejected)
- [7. Security model](#7-security-model)
- [8. Data model](#8-data-model)
- [9. Testing strategy](#9-testing-strategy)
- [10. Deployment](#10-deployment)
- [11. Known limitations](#11-known-limitations)

---

## 1. What the system does

A credit officer preparing a Credit Appraisal Memo (CAM) for a corporate
borrower manually reads annual reports, GST returns, bank statements and legal
notices; cross-checks them for fraud patterns; scores the borrower against the
five Cs of credit; applies internal policy to reach an approve/reject decision
with a limit and a price; and writes it all up.

IntelliCredit automates that pipeline. An analyst registers a borrower, uploads
their documents, and gets back a scored assessment with a decision, a sized
limit, a covenant package, a what-if simulator, an audit trail and a
downloadable Word memo.

The design constraint that shapes everything else: **a credit decision must be
explainable and reproducible.** Every score carries the evidence it was
computed from, every decision names the policy gates it applied, and running
the same case twice produces the same answer.

---

## 2. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser — React 19 SPA (Vercel)                                     │
│                                                                      │
│   React Router ──► pages/  ──► components/                           │
│                       │                                              │
│   TanStack Query ─────┘  owns all server state, caching,             │
│         │                invalidation and retries                    │
│         ▼                                                            │
│   lib/api.ts  — single fetch client, attaches the JWT                │
└──────────────────────────┬───────────────────────────────────────────┘
                           │  HTTPS + Bearer token
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FastAPI (Render, Docker)                                            │
│                                                                      │
│   api/routes/     auth · applications · documents · cam · chat       │
│        │          every route resolves cases through an              │
│        │          ownership-checked dependency                       │
│        ▼                                                             │
│   services/       pipeline (orchestration) · storage · case_service  │
│        │                                                             │
│        ├──► ingest/     PDF · OCR · GST · bank · CIBIL · ITR parsers │
│        ├──► analysis/   policy → five_cs → decision_engine           │
│        ├──► cam/        python-docx memo generator                   │
│        └──► llm/        OPTIONAL — extraction · classification ·     │
│                         narrative · chat                             │
└───────────┬──────────────────────────────────┬───────────────────────┘
            │                                  │
            ▼                                  ▼
   ┌──────────────────┐              ┌──────────────────────┐
   │ Postgres         │              │ Anthropic API        │
   │ (Supabase)       │              │ (optional)           │
   │ via SQLAlchemy   │              │ claude-opus-5        │
   │ + Alembic        │              └──────────────────────┘
   └──────────────────┘
```

### Layering rule

Dependencies point one way only:

```
routes  →  services  →  analysis / ingest / llm  →  policy
```

`analysis/` never imports from `api/` or `db/`. That is what makes the scoring
engine testable as pure functions over dictionaries, with no database, no HTTP
and no mocks — and it is why the suite runs in well under a minute.

---

## 3. Request lifecycle

Take the heaviest path — uploading documents:

1. **`POST /api/applications/{id}/documents`** — the JWT is decoded, the user
   loaded, and the case fetched *filtered by `owner_id`*. A case belonging to
   someone else returns 404, not 403, so the API never confirms it exists.
2. **Validation** (`services/storage.py`) — extension allowlist, then the
   stream is copied to disk under a hard byte cap that aborts mid-write, then
   the file's leading bytes are checked against what the extension claimed.
   A `.pdf` that is not a PDF is deleted and rejected.
3. **Classification** (`services/pipeline.py`) — filename rules first (free),
   then CSV column sniffing (free), then the LLM (paid) only if both drew a
   blank.
4. **Extraction** — the regex parsers run and are authoritative. Only if an
   annual report yields no quantitative figures does the LLM second pass run,
   and anything it returns is tagged `extraction_source="llm"`.
5. **Recomputation** — the *whole case* is rebuilt from all stored documents.
   Never incremental. Re-analysing twice gives the same answer.
6. **Scoring → decision** — `five_cs` produces pillar scores with per-component
   evidence, `decision_engine` applies the gates, sizes the limit, prices it
   and generates covenants.
7. **Persist + audit** — the scored fields and an append-only `ScoreEvent` are
   written **in the same transaction**. A score that changed with no trail
   explaining why would defeat the audit log.

### Why every handler is `def`, not `async def`

The handlers do genuinely blocking work: disk writes, `pypdf`, Tesseract OCR,
pandas. FastAPI runs **sync** handlers in a threadpool and **async** handlers
directly on the event loop. Declaring these `async def` — as an earlier version
did — meant one scanned PDF hitting the OCR path blocked the event loop and
stalled every other request for its duration.

The rule: `async def` only when the body is genuinely `await`-ing I/O. With a
synchronous SQLAlchemy session and synchronous parsers, `def` is correct.

---

## 4. The scoring domain

### One source of policy truth

`analysis/policy.py` holds every constant the bank could change — gate
thresholds, limit multiples, pillar weights — plus the shared DSCR fallback
rule. The scorer, the decision engine, the override path and the `/meta`
endpoint that feeds the UI all read from it.

This exists because of a real bug: the composite cut-off was defined as
`MIN_TOTAL_SCORE` in one module and re-typed as a literal `60` in the
field-note path. Changing the policy in one place left the other on the old
threshold, so the same case could be graded against two different cut-offs
depending on which route recomputed it.

### Missing evidence is not failure

Every component scores at half its maximum when its figure is absent, and is
marked `evidenced: false` in the breakdown. An `evidence_coverage` percentage
reports how much of the score rests on real documents.

The alternative — treating absent data as zero — would reject borrowers for
paperwork the bank never asked for. Likewise, a limit constraint that cannot be
computed is marked `available: false` rather than sized at nil.

### The decision engine shows its working

`decide_application` returns not just a verdict but the full gate list (breached
or not, with the figures each was tested against), the three limit constraints
with the binding one identified, the pricing basis, and covenants each carrying
the specific weakness it answers. All of it is persisted and rendered in both
the UI and the memo.

### Field notes go *through* the engine, not around it

An analyst's written observations trigger keyword penalties. These are applied
to the **pillar scores before** `decide_application` runs.

The previous implementation patched the engine's *output* afterwards: it
re-checked only the score gate and hand-edited the decision. A note that pushed
a case below the cut-off produced `REJECT` while the stored gates still showed
the score gate cleared, and the memo still carried a limit and covenant package
sized on the higher score. There is now one path, and a test asserts the gates
can never disagree with the recorded decision.

---

## 5. Where LLMs are used — and where they are not

**The scoring and decision engine contains no LLM and never will.** A bank
cannot defend "the model approved it". It can defend "the policy engine
approved it, deterministically, and here is the working".

The model is used in four places where it genuinely beats the alternative:

| Use | Why a model wins | Guardrail |
|---|---|---|
| **Extraction fallback** | Regex over a scanned or unusually laid-out annual report finds nothing. This is the weakest link in the pipeline. | Runs only when the regex pass returns no figures. Schema makes every field optional and instructs omission over estimation. Results tagged `extraction_source="llm"` so the audit trail distinguishes them. |
| **Classification fallback** | `Scan_0042.pdf` used to be classified `unclassified` and silently dropped out of scoring. | Closed set of types; must return `unclassified` below 0.7 confidence. Runs only after filename rules and CSV sniffing fail. |
| **CAM narrative** | Template-stitched prose reads like a template. | The decision, score, limit and covenants are already fixed. The model writes commentary around them and is forbidden from restating or contradicting a figure. Drafting is an explicit action, and the result is stored on the case and rendered into the .docx. |
| **Analyst chat** | "Why was this rejected?" is a natural-language question about structured data. | Answers only from the case record; explicitly told not to offer a competing recommendation. The question is delimited and the system prompt states its contents are data, not instructions. |

**Every one of them degrades to nothing.** With `ANTHROPIC_API_KEY` unset,
`llm/client.py` returns `None` from every call, the deterministic path
continues, and `/api/meta` reports `features.llm_assist: false` so the UI hides
the optional panels. Errors are logged and swallowed, never raised — a failed
extraction becomes "the regex found nothing", not a 500 on upload.

Implementation notes: structured calls use `client.messages.parse()` with a
Pydantic schema, so output cannot come back as prose that then fails to parse.
Effort is tuned per task — `low` for mechanical extraction and classification,
`high` for the narrative and chat. System prompts are marked cacheable and case
JSON is serialised with `sort_keys=True`, because an unsorted dump reorders
between runs and would invalidate the prompt cache on every request.

---

## 6. Technology choices and the alternatives rejected

### Backend framework: FastAPI

*Considered: Django REST Framework, Flask.*

- **Over Django REST Framework** — Django's value is its ORM, admin and
  batteries-included stack. This application is a JSON API with a heavy pure-
  Python domain layer; the admin and template engine would go unused, and DRF's
  serializer layer duplicates what Pydantic already does.
- **Over Flask** — Flask needs extensions for validation, serialisation and
  docs, each chosen and wired by hand. FastAPI gets request validation,
  response models and an OpenAPI schema from the same type annotations.
- **The deciding factor**: dependency injection. `get_case` is a single
  dependency that resolves a case *filtered by owner*, and every route that
  takes `OwnedCase` is authorised by construction. Authorisation cannot be
  forgotten on a new endpoint, because a route with no `CurrentUser` dependency
  simply has no user to work with.

### Language: Python

The domain is document parsing (pypdf, Tesseract), tabular analysis (pandas)
and financial computation. That ecosystem is Python's, and the ingestion layer
would be materially harder in Node or Go.

### Database: PostgreSQL

*Considered: staying on SQLite, MongoDB.*

- **Over SQLite** — SQLite on Render's ephemeral filesystem loses every case on
  redeploy, and it serialises writes. That was the actual state of the previous
  build.
- **Over MongoDB** — the data is strongly relational: users own cases, cases
  own documents and score events, and every read is scoped by ownership.
  Foreign keys with `ON DELETE CASCADE` enforce that in the database rather
  than in application code. Postgres's `JSONB` covers the genuinely
  document-shaped parts (`score_breakdown`, `limit_working`, `covenants`), so
  there is no schema-flexibility argument left for Mongo.
- The code targets a `DATABASE_URL`, so it runs on SQLite locally and Postgres
  in production without a change. Tests run against in-memory SQLite for speed.

### ORM: SQLAlchemy 2.0 + Alembic

The previous build had a hand-rolled `_migrate_sqlite()` that could only *add*
columns and mapped anything it did not recognise to `TEXT`. It could not
rename, drop or backfill, and it silently diverged from the models. Alembic
generates migrations from model diffs, versions them, and rolls back. CI runs
`alembic upgrade head` on every push, so a migration that drifts from the
models fails the build rather than the deploy.

### Auth: JWT with a users table

*Considered: server-side sessions, Auth0/Clerk.*

- **Over server-side sessions** — the frontend and backend are on different
  origins (Vercel and Render). Cookie-based sessions across origins mean
  `SameSite=None`, CSRF tokens and cookie-domain configuration. A bearer token
  in an `Authorization` header sidesteps all of it.
- **Over a hosted provider** — a hosted IdP would be the right call for a
  product with SSO and password-reset requirements. Here it would add a vendor
  and hide the mechanism.
- **bcrypt directly rather than passlib** — passlib has been effectively
  unmaintained since 2020 and its bcrypt backend breaks against bcrypt ≥ 4.1.
  Calling bcrypt ourselves is fifteen lines and removes a dependency that is a
  known source of version pinning pain.

### Frontend: React 19 + TypeScript + Vite

*Considered: Next.js, plain Vite SPA without a router.*

- **Over Next.js** — SSR and file-based routing earn their complexity for
  content sites that need SEO. This is an authenticated internal tool; every
  page is behind a login and none of it should be indexed. A static SPA on a
  CDN is simpler to reason about and free to host.
- **Vite over Create React App** — CRA is deprecated; Vite's dev server is
  near-instant.

### Server state: TanStack Query

*Considered: Redux Toolkit, Zustand, the hand-rolled hooks that were there.*

The previous `App.tsx` was 528 lines of `useState` for every slice of case
data, `Promise.all` loaders, manual loading flags and hand-written re-fetches
after each mutation. The bug that pattern invites: forgetting to refresh one of
the four things a re-score changes.

TanStack Query is built for *server* state specifically — caching, staleness,
retries and invalidation. Everything for a case is keyed under `['case', id]`,
so one `invalidateQueries` after a mutation refreshes the assessment, the
documents, the break-even figures and the audit trail together, because they
genuinely do move together.

Redux/Zustand solve *client* state, which this app barely has — a sidebar
collapse flag and a theme. Reaching for a global store to hold server data is
the mistake TanStack Query exists to correct.

### Routing: React Router

Screen state used to live in `useState`, so a case was not linkable and the
back button did nothing. The open tab is now a URL segment
(`/cases/12/assessment`), which makes screens bookmarkable and shareable and
gives route guards a natural place to live.

---

## 7. Security model

| Concern | Control |
|---|---|
| **Authentication** | JWT bearer tokens, HS256, 12-hour expiry. Passwords bcrypt-hashed; >72-byte passwords rejected rather than silently truncated. |
| **Authorisation** | Every case is resolved through `get_case`, which filters by `owner_id`. Unauthorised and non-existent are indistinguishable (both 404). |
| **User enumeration** | Login returns one identical error for "no such user" and "wrong password". |
| **Document exposure** | The `StaticFiles` mount over the upload directory is **gone**. Files are served only through an authenticated, ownership-checked route. Previously any caller who guessed a sequential case id could download a borrower's bank statements. |
| **Path traversal** | Filenames are normalised to a flat basename — handling Windows-style paths, which `os.path.basename` alone does not — and the resolved path is asserted to stay inside the upload root. |
| **Upload abuse** | Extension allowlist, magic-byte verification, a per-file byte cap enforced *during* the copy (not from a client-supplied `Content-Length`), and a per-request file count limit. |
| **Secrets** | Everything from the environment. `SECRET_KEY` fails loudly at startup in production if left at its development default. `.env` is gitignored and `.env.example` documents the shape. |
| **CORS** | Origins from the environment, with a regex for Vercel previews, rather than a hardcoded list. |
| **Prompt injection** | Analyst questions are wrapped in a delimited block and the system prompt states its contents are data, never instructions. |
| **Container** | Runs as a non-root user. |

---

## 8. Data model

```
users ──1:N──► applications ──1:N──► documents
                     │
                     └────1:N──────► score_events
```

- `applications.owner_id` is the tenancy boundary. Non-nullable, indexed,
  `ON DELETE CASCADE`.
- `documents` has a unique constraint on `(application_id, filename)`, so
  re-uploading the same file updates the existing row rather than letting a
  case double-count one legal notice.
- `score_events` is append-only — the audit trail. Every recompute writes one,
  with the gates applied, the pillar figures and the score movement.
- The genuinely document-shaped payloads (`score_breakdown`, `limit_working`,
  `covenants`, `research`, `red_flags`, `raw_data`, `narrative`) are `JSON`
  columns. They are read as whole objects and never queried field-by-field, so
  normalising them into tables would add joins for no benefit.
- All timestamps are timezone-aware UTC (`datetime.now(timezone.utc)`;
  `utcnow()` is deprecated and returns a naive value).

---

## 9. Testing strategy

**166 tests, 89% coverage.**

| Suite | What it protects |
|---|---|
| `test_decision_engine.py` | Gates, limit sizing, pricing, covenants, sensitivity, break-even. Each test names the policy it guards, so a changed constant fails with an explanation. |
| `test_five_cs.py` | Weights sum to 100, no pillar exceeds its weight, missing evidence scores between best and worst case, every component carries a stated basis. |
| `test_pipeline.py` | Classification, CSV sniffing, idempotent recompute, and the regression that gates can never disagree with the recorded decision. |
| `test_auth_and_isolation.py` | Registration, login, token validation, and — most importantly — that a second analyst gets 404 on every route touching someone else's case. |
| `test_uploads.py` | Path traversal, extension allowlist, magic bytes, size cap, and that the old static mount is really gone. |
| `test_document_parsers.py` | Every parser, with the property that an absent figure is omitted rather than zeroed. |
| `test_api_workflow.py` | The whole workflow end-to-end through HTTP. |
| `test_cam.py` | The memo builds at any stage of completeness, and the drafted narrative actually reaches the `.docx`. |
| `test_demo_packs.py` | The three demo borrower packs are generated, pass upload validation, and each reaches its intended verdict — so a scoring change breaks the build, not the demo. |

The bias is toward testing *properties* rather than values: "missing evidence
must not be scored as failure" survives a re-weighting of the model, where
`assert score == 73.4` would not.

Tests use in-memory SQLite with a `StaticPool` and a dependency-overridden
session, so each test gets a clean database with no fixtures to reset. No test
ever calls the Anthropic API — `conftest.py` clears the key.

CI (GitHub Actions) runs lint, migrations, backend tests with an 80% coverage
floor, frontend typecheck and build, and builds both Docker images.

---

## 10. Deployment

| Piece | Where | Notes |
|---|---|---|
| Frontend | Vercel | Static SPA. `vercel.json` rewrites all paths to `index.html` so deep links survive a refresh. `VITE_API_URL` is inlined at build time. |
| Backend | Render | Docker, `python:3.12-slim` + `tesseract-ocr`. `alembic upgrade head` runs at boot, so a deploy can never serve a schema older than the code. `/health` for the probe. |
| Database | Supabase Postgres | Pooled connection (port 6543). `pool_pre_ping` is on because managed Postgres closes idle connections and Render free instances sleep. |
| Secrets | Platform env vars | Never in the repository. |

---

## 11. Known limitations

Stated plainly, because knowing where the edges are is part of the design:

1. **The research layer is simulated.** MCA registry data, court records, press
   sentiment and peer medians are generated deterministically per borrower and
   labelled `simulated` everywhere they surface. Real MCA/CIBIL integrations
   need commercial agreements.
2. **Uploaded files live on the container filesystem**, so they do not survive
   a redeploy even though the database now does. Object storage (S3/Supabase
   Storage) is the next step; the `services/storage.py` seam exists so that
   swap touches one module.
3. **Ingestion is synchronous.** It runs in a threadpool rather than on the
   event loop, so it no longer blocks other requests, but a large scanned PDF
   still makes the caller wait. A task queue (Celery/RQ + Redis) with a `202
   Accepted` response is the correct next step and is why the upload route is
   written to be movable.
4. **Scoring is rules-based, not learned.** This is deliberate — the rules are
   explainable and a trained model would need a labelled default history the
   project does not have — but it means the weights are expert judgement rather
   than fitted.
5. **No rate limiting** on authentication endpoints. In front of real users
   this needs a limiter on login and registration.
6. **Single-role users.** There is no maker/checker separation, which a real
   sanctioning workflow requires.
7. **The half-credit rule interacts with the score cut-off.** Absent evidence
   scores each component at half its maximum, which is the right local
   behaviour — but a borrower with almost no documents therefore lands near 50,
   below the composite cut-off of 60, and is rejected on the score gate before
   the engine ever reaches the `REFER` path that exists for exactly that case.
   So "missing evidence is not failure" holds per component but weakens in
   aggregate. The clean fix is to test evidence coverage *before* the score
   gate and route a thin file to `REFER` regardless of composite. It is left
   as a decision rather than made silently, because it changes outcomes.
