# FRETBOX OUTREACH AI — INITIAL AGENT PROMPT
### Copy everything below the line and paste as your first message to the agent.

---
---

You are a senior full-stack engineer. Your job is to build **Fretbox Outreach AI** — a semi-autonomous B2B outreach system that helps a SaaS company (Fretbox) acquire Indian universities as clients.

Read every section of this prompt carefully before writing a single line of code. Your execution must follow the phased order defined below. Do not skip ahead. Do not improvise the tech stack.

---

## WHAT THIS SYSTEM DOES (Read First)

The system performs this pipeline, fully automated:

```
UGC Excel Upload
     ↓
Website Discovery (Google CSE + Playwright fallback)
     ↓
Stakeholder Extraction (Playwright scraper → Vice Chancellors, Registrars, etc.)
     ↓
LinkedIn + News Enrichment (Google CSE queries)
     ↓
Priority Scoring (Deterministic formula + LLM scoring = Lead Tier: High/Medium/Low)
     ↓
Tiered Email Outreach (Celery Beat cadence: High=4 touches, Medium=3, Low=1)
     ↓
Reply Classification (LLM → meeting_request / not_interested / opt_out / etc.)
     ↓
Action Dispatch (Send Calendly link / pause sequence / auto-respond)
     ↓
Meeting Booked (Calendly webhook → notify sales + generate agenda)
     ↓
AI Proposal Generated (LLM → structured JSON → WeasyPrint PDF → S3)
```

---

## TECH STACK — NON-NEGOTIABLE. USE EXACTLY THESE.

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python 3.11+), Pydantic v2 |
| ORM | SQLAlchemy 2.0 async |
| Task Queue | Celery 5.x + Celery Beat |
| Message Broker | Redis (Redis Cloud in prod, local Redis in dev) |
| Database | Supabase PostgreSQL (asyncpg driver) |
| File Storage | Supabase Storage (Using supabase-py client) |
| Web Scraping | Serper.dev (Search/Discovery) + Playwright Python (Extraction) |
| LLM | OpenAI Python SDK — GPT-4o, always use `response_format={"type": "json_object"}` for structured outputs |
| Email Delivery | SendGrid Python SDK |
| Inbound Email | SendGrid Inbound Parse webhook |
| PDF Generation | WeasyPrint |
| Frontend | React 18 + Vite + Tailwind CSS v3 |
| Data Fetching | TanStack React Query v5 |
| Routing | React Router v6 |
| Deployment | Fly.io (backend + worker) + Vercel (frontend) |
| Testing | pytest + pytest-asyncio + httpx |
| Logging | structlog (JSON structured logs, not print()) |
| Error Tracking | Sentry SDK (FastAPI + Celery) |

---

## PROJECT STRUCTURE — CREATE THIS EXACTLY

```
fretbox-outreach/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app factory + lifespan
│   │   ├── config.py                # Pydantic BaseSettings (all env vars)
│   │   ├── database.py              # Async SQLAlchemy engine + get_db()
│   │   ├── models/
│   │   │   ├── university.py
│   │   │   ├── stakeholder.py
│   │   │   ├── signal.py
│   │   │   ├── priority_score.py
│   │   │   ├── outreach_sequence.py
│   │   │   ├── email_sent.py
│   │   │   ├── reply_log.py
│   │   │   └── proposal.py
│   │   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── routers/
│   │   │   ├── ingest.py
│   │   │   ├── universities.py
│   │   │   ├── enrichment.py
│   │   │   ├── outreach.py
│   │   │   ├── proposals.py
│   │   │   └── webhooks.py
│   │   ├── services/                # Pure business logic (no HTTP, no DB)
│   │   └── tasks/
│   │       ├── website_tasks.py
│   │       ├── scraper_tasks.py
│   │       ├── enrichment_tasks.py
│   │       ├── scoring_tasks.py
│   │       ├── outreach_tasks.py
│   │       ├── reply_tasks.py
│   │       └── proposal_tasks.py
│   ├── utils/
│   │   ├── s3.py
│   │   ├── llm.py
│   │   ├── email_service.py
│   │   └── scraper.py
│   ├── templates/
│   │   ├── email/
│   │   │   ├── intro.html
│   │   │   ├── followup_1.html
│   │   │   ├── followup_2.html
│   │   │   └── final.html
│   │   └── proposal/
│   │       └── proposal.html
│   ├── celery_app.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── fly.toml
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Universities.jsx
│   │   │   ├── Enrichment.jsx
│   │   │   ├── Outreach.jsx
│   │   │   └── Proposals.jsx
│   │   ├── components/
│   │   └── hooks/
│   ├── package.json
│   └── vercel.json
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## ALL ENVIRONMENT VARIABLES

Create `.env.example` with these exact keys:

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/dbname
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Redis
REDIS_URL=redis://localhost:6379/0

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=outreach@fretbox.in
SENDGRID_FROM_NAME=Fretbox Team
SENDGRID_WEBHOOK_SECRET=

# Serper.dev
SERPER_API_KEY=

# Calendly
CALENDLY_WEBHOOK_SECRET=
CALENDLY_LINK=https://calendly.com/fretbox/demo

# App
FRONTEND_URL=http://localhost:5173
ENVIRONMENT=development

# Sentry
SENTRY_DSN=
```

---

## DATABASE SCHEMA — ALL 8 TABLES

Run this SQL in Supabase SQL Editor. Create all tables before writing any ORM models.

```sql
-- Enable UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. UNIVERSITIES
CREATE TABLE universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_name TEXT NOT NULL,
  state TEXT,
  city TEXT,
  affiliation TEXT,
  university_type TEXT,           -- 'private', 'deemed', 'state', 'central'
  website_url TEXT,
  website_status TEXT DEFAULT 'new',  -- new | verifying | verified | discovered | failed
  outreach_stage TEXT DEFAULT 'new',  -- new | contacted | replied | meeting_scheduled | proposal_sent | converted | dead
  opted_out BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. STAKEHOLDERS
CREATE TABLE stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  source_url TEXT,
  confidence_score FLOAT DEFAULT 0.0,
  linkedin_url TEXT,
  enrichment_status TEXT DEFAULT 'pending',  -- pending | enriched | failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. UNIVERSITY SIGNALS
CREATE TABLE university_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id) ON DELETE CASCADE,
  signal_type TEXT,    -- naac_grade | news | it_page | hostel_page | modern_website | digital_initiative
  signal_value TEXT,
  weight INT DEFAULT 0,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRIORITY SCORES
CREATE TABLE priority_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id) ON DELETE CASCADE UNIQUE,
  deterministic_score INT DEFAULT 0,
  ai_score FLOAT DEFAULT 0.0,
  final_score FLOAT DEFAULT 0.0,
  tier TEXT,           -- High | Medium | Low
  ai_reasoning TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. OUTREACH SEQUENCES
CREATE TABLE outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id) ON DELETE CASCADE,
  stakeholder_id UUID REFERENCES stakeholders(id),
  tier TEXT,
  sequence_step INT DEFAULT 0,   -- 0=intro, 1=followup1, 2=followup2, 3=final
  next_email_date DATE,
  status TEXT DEFAULT 'active',  -- active | paused | completed | opted_out
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. EMAILS SENT
CREATE TABLE emails_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  stakeholder_id UUID REFERENCES stakeholders(id),
  sequence_id UUID REFERENCES outreach_sequences(id),
  email_type TEXT,               -- intro | followup_1 | followup_2 | final | proposal
  subject TEXT,
  sendgrid_message_id TEXT,
  email_status TEXT DEFAULT 'sent',  -- sent | delivered | opened | clicked | bounced | spam
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. REPLY LOGS
CREATE TABLE reply_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  stakeholder_id UUID REFERENCES stakeholders(id),
  from_email TEXT,
  subject TEXT,
  body TEXT,
  classification TEXT,  -- meeting_request | demo_request | info_request | budget_query | not_interested | auto_reply | opt_out
  classification_confidence FLOAT,
  action_taken TEXT,
  processed BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PROPOSALS
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  stakeholder_id UUID REFERENCES stakeholders(id),
  trigger_reason TEXT,           -- meeting_scheduled | demo_request | manual
  generated_content JSONB,       -- {executive_summary, challenges, modules, timeline, outcomes}
  pdf_url TEXT,
  storage_path TEXT,
  status TEXT DEFAULT 'draft',   -- draft | sent | accepted | rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_universities_website_status ON universities(website_status);
CREATE INDEX idx_universities_outreach_stage ON universities(outreach_stage);
CREATE INDEX idx_stakeholders_university ON stakeholders(university_id);
CREATE INDEX idx_outreach_sequences_next_date ON outreach_sequences(next_email_date, status);
CREATE INDEX idx_reply_logs_processed ON reply_logs(processed);
```

---

## PRIORITY SCORING FORMULA

Implement this exactly in `services/scoring_service.py`:

```python
SCORING_FACTORS = {
    "private_university":          15,  # university_type in ['private', 'deemed']
    "recently_in_news":            15,  # signal_type='news' exists
    "naac_a_plus":                 10,  # signal_value='A++'
    "naac_a":                       8,  # signal_value='A' or 'A+'
    "has_it_or_admin_page":        10,  # detected IT/Admin/ERP page on site
    "modern_website":               5,  # JS framework detected (React/Angular/Vue)
    "multiple_emails_found":       10,  # stakeholders count >= 3
    "tier1_city":                  10,  # city in ['Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Pune','Kolkata']
    "edu_or_ac_domain":             5,  # website ends in .edu.in or .ac.in
    "digital_transformation_mention": 10,  # keyword detected in site content
}
# Max deterministic = 98

# AI Score: 0–10 (only computed if deterministic_score >= 40)
# final_score = deterministic_score + ai_score
# Tier: final_score >= 80 → High | >= 60 → Medium | < 60 → Low
```

---

## OUTREACH CADENCE

```python
CADENCE = {
    "High":   [0, 3, 7, 14],   # days after sequence start
    "Medium": [0, 5, 12],
    "Low":    [0],
}

EMAIL_TEMPLATES = {
    0: "intro",
    1: "followup_1",
    2: "followup_2",
    3: "final",
}
```

---

## LLM PROMPTS — USE THESE EXACT SYSTEM PROMPTS

### Priority AI Scoring
```
System: You are evaluating Indian private universities as B2B sales prospects for 
Fretbox — a campus management SaaS platform. Analyze the provided university 
homepage text and score the likelihood (0–10) that this institution would invest 
in modern campus management/ERP software. Consider: modernization signals, 
infrastructure mentions, scale of operations, and institutional ambition.
Respond ONLY with valid JSON: {"score": <number 0-10>, "reasoning": "<2 sentences max>"}

User: University: {university_name}
Homepage text (first 2000 chars): {homepage_text}
```

### Reply Classification
```
System: You classify inbound sales email replies for a B2B SaaS company.
Classify into exactly ONE of these categories:
- meeting_request: They want to schedule a call or meeting
- demo_request: They want to see a product demo
- info_request: They want more information / brochure / pricing
- budget_query: They are asking about cost or budget
- not_interested: They explicitly decline or show no interest
- auto_reply: This is an out-of-office or automated response
- opt_out: They ask to be removed from the list
Respond ONLY with valid JSON: {"classification": "<category>", "confidence": <0.0-1.0>, "key_signals": ["<phrase1>", "<phrase2>"]}

User: Subject: {subject}
Body: {body}
```

### Personalization Snippet
```
System: You write opening sentences for B2B sales emails targeting Indian university 
administrators. Be specific, warm, and reference real context. Do NOT mention software yet.
Keep it to exactly 2 sentences. Return plain text only, no JSON.

User: Recipient: {role} {name} at {university_name}
Context signals: {signals_list}
```

### Proposal Generation
```
System: You generate structured sales proposals for Fretbox campus management software 
targeting Indian universities. Be specific to the institution. Identify real pain points 
from the signals provided. Map Fretbox modules to detected needs.
Respond ONLY with valid JSON matching this exact schema:
{
  "executive_summary": "<3-4 sentence overview tailored to this university>",
  "identified_challenges": ["<challenge 1>", "<challenge 2>", "<challenge 3>"],
  "recommended_modules": [
    {"module": "<module name>", "reason": "<why this university needs it>"}
  ],
  "implementation_timeline": "<realistic phased timeline>",
  "expected_outcomes": ["<outcome 1>", "<outcome 2>", "<outcome 3>"],
  "personalized_opening": "<1 paragraph addressing the specific stakeholder>"
}

User: University: {university_name} ({university_type}, {city}, {state})
Stakeholder: {role} {stakeholder_name}
Priority Tier: {tier} (Score: {final_score})
Detected signals: {signals_json}
Recent news: {news_snippets}
```

---

## MODULE RECOMMENDATION LOGIC

```python
def recommend_modules(signals: list[dict]) -> list[str]:
    signal_types = [s["signal_type"] for s in signals]
    signal_values = " ".join([s["signal_value"] or "" for s in signals]).lower()
    
    modules = []
    if "hostel_page" in signal_types or "hostel" in signal_values:
        modules.append("Hostel & Accommodation Management")
    if "online_admission" in signal_types or "admission" in signal_values:
        modules.append("Admission Workflow Automation")
    if "naac_grade" in signal_types:
        modules.append("NAAC Compliance & Reporting Dashboard")
    if any("student" in v for v in signal_values.split()):
        modules.append("Student Lifecycle Management")
    if "fee" in signal_values or "payment" in signal_values:
        modules.append("Fee Collection & Finance Module")
    if not modules:
        modules = ["Campus ERP Core", "Student Information System"]
    return modules
```

---

## CODE QUALITY RULES — ENFORCE IN EVERY FILE YOU WRITE

1. **Type hints everywhere** — every function parameter and return value
2. **Async all the way** — all DB operations use `async with session` via `get_db()`
3. **Celery task defaults** — every task must have: `bind=True`, `max_retries=3`, `soft_time_limit=300`, exponential backoff on retry: `countdown=2 ** self.request.retries`
4. **No hardcoded values** — all config comes from `config.py` (Pydantic BaseSettings)
5. **Consistent API response shape** — every endpoint returns: `{"success": bool, "data": <payload>, "error": str | None}`
6. **Structured logging** — use `structlog.get_logger()`. Always bind `university_id` and `task_id` to log context
7. **External API error handling** — wrap every OpenAI, SendGrid, CSE call in try/except with specific error type handling and Sentry capture
8. **No direct print()** — use structlog exclusively
9. **React: Tailwind only** — zero inline styles, zero CSS files
10. **All React API calls via React Query** — no raw axios calls in components

---

## BUILD PHASES — EXECUTE IN ORDER, STOP AND CONFIRM BETWEEN PHASES

---

### ▶ PHASE 1: SCAFFOLD & INFRASTRUCTURE
**Goal:** Working skeleton. Every service connected. Zero business logic.

**Execute these steps in order:**

**Step 1.1 — Repo + Docker**
- Create the full directory structure shown above
- `docker-compose.yml` with 3 services: `api` (FastAPI, port 8000), `worker` (Celery), `redis` (redis:7-alpine)
- Use bind mounts for hot reload in dev
- `.env.example` with all variables listed above

**Step 1.2 — Config + Database**
- `backend/app/config.py`: Pydantic BaseSettings loading all env vars from `.env`
- `backend/app/database.py`: Async SQLAlchemy engine, `AsyncSession`, `get_db()` dependency, `create_all_tables()` function

**Step 1.3 — ORM Models**
- Create all 8 SQLAlchemy models matching the schema above exactly
- Use `relationship()` with `back_populates` where appropriate
- All models inherit from a `Base` with `created_at` / `updated_at` via `mapped_column`

**Step 1.4 — FastAPI App**
- `backend/app/main.py`: lifespan context manager calling `create_all_tables()` on startup
- CORS middleware allowing `FRONTEND_URL`
- Mount all routers (stubs are fine)
- `GET /health` → `{"status": "ok", "version": "1.0.0", "environment": config.ENVIRONMENT}`

**Step 1.5 — Celery**
- `backend/celery_app.py`: Celery instance with Redis broker + result backend, JSON serializer, UTC timezone
- Empty Beat schedule for now

**Step 1.6 — Supabase Storage Utility**
- `backend/utils/storage.py`:
  - Initialize Supabase client using `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
  - `upload_file(file_bytes: bytes, path: str, content_type: str) -> str` (returns public URL)
  - `get_public_url(path: str) -> str`
  - `delete_file(path: str) -> bool`

**Step 1.7 — Frontend Skeleton**
- Vite + React 18 + Tailwind CSS v3
- Install: `react-router-dom`, `@tanstack/react-query`, `axios`
- Sidebar layout with 5 nav links: Dashboard, Universities, Enrichment, Outreach, Proposals
- Each page renders a placeholder `<h1>` for now

**Step 1.8 — Verify**
- `docker-compose up` starts without errors
- `GET http://localhost:8000/health` returns 200
- Frontend loads at `http://localhost:5173`

**When Phase 1 is done, output exactly:**
```
✅ PHASE 1 COMPLETE
- Docker: 3 services running
- Health: GET /health → 200
- DB: All 8 tables created
- Storage: Supabase storage utility tested
- Frontend: Loads at localhost:5173
Awaiting confirmation to proceed to Phase 2.
```

---

### ▶ PHASE 2: DATA INGESTION & WEBSITE DISCOVERY
*(Start only after Phase 1 confirmed)*

**Step 2.1 — Excel Ingestion Endpoint**
- `POST /api/ingest/excel` — multipart file upload
- Parse with `openpyxl`, handle column name variations (case-insensitive matching)
- Bulk upsert to `universities` using `INSERT ... ON CONFLICT (university_name) DO UPDATE`
- Return: `{"total": n, "inserted": n, "updated": n, "errors": [...]}`

**Step 2.2 — Website Validation Task**
- Celery task `validate_website(university_id: str)`
- HTTP GET with 8s timeout, follow redirects, verify content contains university name keywords
- Update `website_status` → `verified` | `unverified`

**Step 2.3 — Website Discovery Task**
- Celery task `discover_website(university_id: str)`
- Search Serper.dev: `"{university_name}" official website india`
- Score results: `.ac.in`/`.edu.in` domain (+3), name in domain (+2), name in title (+2)
- Minimum score threshold: 4
- Update `website_url` + `website_status = 'discovered'`

**Step 2.4 — Batch Dispatch Endpoint**
- `POST /api/universities/discover-websites`: fires Celery `group()` for all `website_status='new'` universities
- `GET /api/universities`: paginated list with filters `?state=&type=&website_status=&tier=&limit=50&offset=0`
- `GET /api/universities/{id}`: single university detail

**Step 2.5 — Universities Page (React)**
- Excel drag-and-drop upload with `react-dropzone`
- Ingestion progress bar
- Filterable data table: Name | State | Type | Website | Status | Tier
- "Discover Websites" button triggers batch endpoint
- React Query polling every 20s

---

### ▶ PHASE 3: STAKEHOLDER EXTRACTION & ENRICHMENT
*(Start only after Phase 2 confirmed)*

**Step 3.1 — Stakeholder Targeting (Serper)**
- Celery task `target_stakeholders(university_id: str)`
- Query Serper.dev: `"{university_name}" (Vice Chancellor OR Registrar OR Administration OR Contact)`
- Extract top 3-5 specific URLs from organic results. Pass to scraping task.

**Step 3.2 — Playwright Extraction Task**
- Celery task `extract_stakeholders(urls: list[str], university_id: str)`
- `backend/utils/scraper.py` runs headless Chromium on the specific targeting URLs.
- Regex + keyword matching for target roles: Vice Chancellor, Registrar, Chancellor, President, Dean. Extract name, role, email, phone.
- Upsert to `stakeholders` table.

**Step 3.3 — LinkedIn Enrichment Task**
- Celery task `enrich_linkedin(stakeholder_id: str)`
- Serper.dev query: `"{name}" "{role}" "{university_name}" site:linkedin.com`
- Extract LinkedIn URL from result links
- Update `stakeholder.linkedin_url`, `enrichment_status='enriched'`

**Step 3.4 — News Enrichment Task**
- Celery task `enrich_news(university_id: str)`
- Run 3 Serper.dev queries:
  1. `"{university_name}" news 2024 2025`
  2. `"{university_name}" NAAC accreditation grade`
  3. `"{university_name}" campus expansion infrastructure technology`
- Parse titles + snippets. Store in `university_signals`

**Step 3.5 — Priority Scoring Tasks**
- Celery task `compute_deterministic_score(university_id: str)`: apply scoring formula above
- Celery task `compute_ai_score(university_id: str)`: only if deterministic_score >= 40; call OpenAI with homepage text
- Celery task `assign_tier(university_id: str)`: compute final_score, assign tier, update `priority_scores`

**Step 3.6 — Enrichment Endpoints**
- `POST /api/universities/{id}/enrich`: triggers Celery chain: targeting → extraction → linkedin → news → scoring
- `GET /api/universities/{id}/stakeholders`
- `GET /api/universities/{id}/signals`
- `GET /api/universities/{id}/priority`

**Step 3.7 — Enrichment Page (React)**
- Per-university panel: stakeholder cards with LinkedIn icon, confidence badge
- News signal feed
- Priority score donut (use recharts)
- Tier badge: High=green, Medium=yellow, Low=gray
- "Run Enrichment" button

---

### ▶ PHASE 4: OUTREACH AUTOMATION ENGINE
*(Start only after Phase 3 confirmed)*

**Step 4.1 — Email Service**
- `backend/utils/email_service.py` — class `EmailService`
- `async send(to_email, subject, html_body, university_id, stakeholder_id, sequence_id, email_type)` → stores record in `emails_sent`
- Retry on SendGrid 429 (rate limit) with 60s backoff
- On bounce: update `email_status='bounced'`

**Step 4.2 — Jinja2 Email Templates**
- Create 4 templates in `backend/templates/email/`
- Variables in all: `{{ stakeholder_name }}`, `{{ role }}`, `{{ university_name }}`, `{{ personalization_snippet }}`, `{{ calendly_link }}`, `{{ unsubscribe_link }}`
- Intro: warm opener, what Fretbox does in 2 sentences, soft CTA
- Followup 1: add social proof, ask a question about their current system
- Followup 2: share a brief case study angle, lower barrier CTA
- Final: respectful last touch, leave door open
- All templates: mobile-responsive HTML, max 200 words body

**Step 4.3 — Personalization Task**
- Celery task `generate_personalization(university_id, stakeholder_id) -> str`
- Fetch top 3 signals. Call OpenAI with personalization prompt above
- Store as `university_signals` with `signal_type='personalization'`

**Step 4.4 — Sequence Management**
- `POST /api/outreach/start-sequence` body: `{university_id, stakeholder_id}`
- Creates `outreach_sequences` record, sets `next_email_date = today`, `sequence_step = 0`
- Triggers personalization task, then dispatches first email immediately

**Step 4.5 — Celery Beat Cadence**
- Beat task `process_due_sequences` — runs every hour
- Query: `outreach_sequences WHERE status='active' AND next_email_date <= TODAY`
- For each: determine template by `sequence_step`, render + send email, increment step, set next date per tier cadence, mark `completed` after final step

**Step 4.6 — SendGrid Delivery Webhook**
- `POST /api/webhooks/sendgrid`
- Verify `X-Twilio-Email-Event-Webhook-Signature` header
- Handle: `delivered`, `open`, `click`, `bounce`, `spamreport`
- On bounce: pause sequence, set `opted_out=True` for hard bounces

**Step 4.7 — Inbound Email Webhook**
- `POST /api/webhooks/email-reply` (SendGrid Inbound Parse)
- Parse multipart: extract `from`, `subject`, `text`
- Match university by reply email thread (check subject for university name, or from-domain match)
- Store in `reply_logs`, trigger `classify_reply` task

**Step 4.8 — Reply Classification Task**
- Celery task `classify_reply(reply_log_id: str)`
- Call OpenAI with classification prompt above
- Update `reply_logs.classification`, `classification_confidence`
- Trigger `dispatch_reply_action` task

**Step 4.9 — Action Dispatcher Task**
- Celery task `dispatch_reply_action(reply_log_id: str)`
- Switch on classification:
  - `meeting_request` / `demo_request` → send email with Calendly link + notify sales
  - `opt_out` → set `universities.opted_out=True`, pause all sequences for university
  - `info_request` → send brochure PDF (pre-stored Supabase Storage URL in config)
  - `not_interested` → pause sequence, update `outreach_stage='dead'`
  - `auto_reply` → do nothing, log it
  - `budget_query` → send pricing context email + notify sales

**Step 4.10 — Outreach Page (React)**
- Kanban board: New | Contacted | Replied | Meeting Booked | Proposal Sent | Converted
- Stats bar: Emails Sent | Open Rate | Reply Rate | Meetings Booked
- Reply feed with classification badges (color-coded)
- "Start Outreach" modal: pick university → pick stakeholder → confirm tier → fire

---

### ▶ PHASE 5: MEETING BOOKING & PROPOSAL GENERATION
*(Start only after Phase 4 confirmed)*

**Step 5.1 — Calendly Webhook**
- `POST /api/webhooks/calendly`
- Verify HMAC-SHA256 signature using `CALENDLY_WEBHOOK_SECRET`
- On `invitee.created`: update `universities.outreach_stage='meeting_scheduled'`
- Generate meeting agenda via LLM (use university signals as context)
- Send confirmation email with agenda to stakeholder

**Step 5.2 — Proposal Generation Task**
- Celery task `generate_proposal(university_id, stakeholder_id, trigger_reason)`
- Fetch: university record, top 5 signals, stakeholder role, priority score, recent news snippets
- Run `recommend_modules()` function
- Call OpenAI with proposal prompt above → parse JSON
- Store in `proposals.generated_content`
- Trigger `render_proposal_pdf` task

**Step 5.3 — PDF Rendering Task**
- Celery task `render_proposal_pdf(proposal_id)`
- Fetch proposal JSON from DB
- Render `backend/templates/proposal/proposal.html` with Jinja2 + WeasyPrint
- Upload PDF to Supabase Storage: `proposals/{university_id}/{proposal_id}.pdf`
- Update `proposals.pdf_url` with public URL, `proposals.storage_path`

**Step 5.4 — Proposal Endpoints**
- `GET /api/proposals?university_id=&status=` — list with filters
- `GET /api/proposals/{id}` — single proposal with generated_content
- `POST /api/proposals/generate` — manual trigger: `{university_id, stakeholder_id, trigger_reason}`
- `GET /api/proposals/{id}/download` — returns fresh public URL
- `POST /api/proposals/{id}/send` — emails PDF to stakeholder, updates status='sent'

**Step 5.5 — Proposals Page (React)**
- Card grid: university name, tier badge, status, created date
- PDF preview in iframe (public URL)
- Download button, Email button, Regenerate button
- Status filter tabs: Draft | Sent | Accepted

---

### ▶ PHASE 6: TESTING & DEPLOYMENT
*(Start only after Phase 5 confirmed)*

**Step 6.1 — Test Suite**
Create `backend/tests/`:
- `test_excel_parser.py`: test ingestion with sample data, column name variations, duplicate handling
- `test_scoring.py`: test each scoring factor individually, test tier assignment boundaries
- `test_reply_classifier.py`: mock OpenAI, test each classification category
- `test_email_templates.py`: render each template with test variables, assert no missing vars
- `test_api.py`: httpx async client tests for `/health`, `/api/ingest/excel`, `/api/universities`

**Step 6.2 — Error Hardening**
- Add Sentry SDK to `main.py` (FastAPI middleware) and `celery_app.py` (signals)
- All Celery tasks: wrap entire body in `try/except Exception as e: logger.error(...); sentry_sdk.capture_exception(e); raise`
- Add `RATE_LIMIT_DELAY = 2.0` config for scraper. Add Redis-based rate limiting for Serper API calls (max 60/minute)

**Step 6.3 — Fly.io Config**
`backend/fly.toml`:
```toml
app = "fretbox-outreach-api"
primary_region = "sin"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8000
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    path = "/health"
    interval = "30s"
    timeout = "10s"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

Create `backend/fly.worker.toml` for Celery worker (same Dockerfile, override CMD).

**Step 6.4 — Vercel Config**
`frontend/vercel.json`:
```json
{
  "rewrites": [{"source": "/(.*)", "destination": "/index.html"}],
  "env": {
    "VITE_API_URL": "https://fretbox-outreach-api.fly.dev"
  }
}
```

**Step 6.5 — README**
Create `README.md` with:
- Setup instructions (clone → .env → docker-compose up)
- All env vars explained
- How to run ingestion
- How to deploy (Fly.io + Vercel commands)
- API endpoint reference table

---

## HOW TO COMMUNICATE WITH ME DURING THE BUILD

After each phase, output this exact block:
```
✅ PHASE [N] COMPLETE
Files created: [list]
Endpoints working: [list]
Tests passing: [list if any]
Known limitations: [list if any]
Awaiting confirmation to proceed to Phase [N+1].
```

If you hit a blocker or ambiguity, output:
```
⚠️ BLOCKER on Step [X.Y]
Issue: [describe]
My proposed approach: [your suggestion]
Alternative: [if any]
Awaiting direction.
```

Do not proceed past a blocker without direction. Do not silently skip steps.

---

## START NOW

Begin **Phase 1, Step 1.1**. Create every file. Show complete code for each file — no placeholders, no `# TODO` comments, no `pass` statements except in stub route handlers. Write production-ready code from the first line.
