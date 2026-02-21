
FRETBOX OUTREACH AI
Intelligent Lean Edition
AI Agent Build Roadmap + Initial Prompt
6 Phases
Build Phases	9 Steps
Functional Flow	Lean Stack
Budget Architecture	Deploy Ready
Cloud Native

PART 1: PROJECT OVERVIEW & ARCHITECTURE
This document provides the complete AI coding agent roadmap for building the Fretbox Outreach AI system — a semi-autonomous AI outreach engine targeting Indian universities. It is organized into 6 build phases with granular steps, checkpoints, and a battle-tested initial prompt for your Google Anti-Gravity IDE agent.

Tech Stack Summary
Backend	FastAPI (Python 3.11+) — Single service, no microservices

Worker	Celery with Redis Cloud as broker + result backend

Database	Supabase PostgreSQL (managed, free tier viable)

Storage	Supabase Storage — proposal PDFs, scraped assets

Scraping	Serper.dev (Discovery/Targeting) + Playwright Python (Extraction)

LLM	OpenAI GPT-4o or Claude API — scoring, proposals, reply classification

Frontend	React + Tailwind CSS deployed on Vercel

Email	SendGrid or AWS SES — outreach + reply handling

Deployment	Fly.io (backend + worker) + Vercel (frontend)

PART 2: STEP-BY-STEP BUILD ROADMAP
The roadmap is structured in 6 phases. Each phase must be completed and tested before proceeding. The AI coding agent should treat each phase as an independent milestone with its own test suite.

PHASE 1: PROJECT SCAFFOLD & INFRASTRUCTURE   ⏱ Day 1–2

Objectives
Stand up the complete skeleton of the application. Every service connected. No business logic yet — just working infrastructure.

#	Task	Details / Output	Tech / Tool
1.1	Init monorepo	Create /backend, /frontend, /workers, /scripts directories. Add .gitignore, README.md, .env.example	Git / Shell
1.2	Backend scaffold	FastAPI app with health endpoint. Folder structure: /routers, /models, /services, /tasks, /utils	FastAPI / Python
1.3	Supabase setup	Create project. Connect via psycopg2. Run initial migration with all tables: universities, stakeholders, outreach_sequences, emails_sent, reply_logs, university_signals, priority_scores, proposals	Supabase / SQL
1.4	Redis + Celery	Connect Redis Cloud. Create celery.py with app config. Test with a dummy task that logs 'hello'	Redis / Celery
1.5	Storage bucket	Create Supabase Storage bucket. Set public access rules. Write upload_file() and get_public_url() utility functions. Test with a dummy file	Supabase Storage
1.6	Environment config	Centralize all secrets in config.py using pydantic BaseSettings. Load from .env	Pydantic
1.7	Frontend scaffold	Create React app with Tailwind. Install react-router-dom, axios, react-query. Set up /pages, /components, /hooks structure	React / Vite
1.8	Docker compose	docker-compose.yml for local dev: fastapi, celery_worker, redis. Include volume mounts	Docker
1.9	CI baseline	GitHub Actions workflow: lint (ruff), type check (mypy), test (pytest) on push	GitHub Actions

PHASE 2: DATA INGESTION & WEBSITE DISCOVERY   ⏱ Day 3–5

Objectives
Ingest the UGC Excel sheet, populate the universities table, discover and verify official websites for each institution.

#	Task	Details / Output	Tech / Tool
2.1	Excel parser	POST /api/ingest/excel endpoint. Use openpyxl to parse UGC sheet. Map columns: university_name, state, city, affiliation, university_type. Bulk upsert to universities table. Return summary stats.	FastAPI / openpyxl
2.2	Ingestion UI	React page: drag-and-drop Excel upload. Progress bar. Table showing ingestion results with row counts.	React / Tailwind
2.3	Website validator	Celery task: validate_website(university_id). If website present in DB: HTTP HEAD check, confirm HTML contains university name. Mark status=website_verified.	Celery / httpx
2.4	Website discovery	If no website: build search query 'university_name official site'. Use Serper.dev (Google Search API). Parse top 3 results. Score each by domain match + content match. Store best match.	Serper.dev
2.5	Playwright fallback	If Serper fails to find a high-confidence match: use Playwright to open the top result URL and parse title + meta description to confirm match.	Playwright
2.6	Batch dispatcher	POST /api/discover/websites triggers Celery group task for all new universities. Polls status via GET /api/universities/status	Celery group
2.7	Dashboard widget	React: website discovery progress ring. Table: university | status | website_url | confidence_score	React

PHASE 3: STAKEHOLDER EXTRACTION & ENRICHMENT   ⏱ Day 6–10

Objectives
Extract senior decision-maker contacts from university websites. Enrich with LinkedIn profile URLs and news signals. Compute priority scores.

#	Task	Details / Output	Tech / Tool
3.1	Stakeholder Targeter	Celery task: scrape_stakeholders(university_id). Query Serper: '{university_name} (Vice Chancellor OR Registrar OR Administration OR Contact)'. Extract top 3-5 specific URLs.	Serper.dev
3.2	Playwright Extractor	Parse top target URLs. Regex + keyword matching for target roles: Vice Chancellor, Registrar, Chancellor, President, Dean. Extract name, role, email, phone.	Playwright / Regex
3.3	Email extractor	Regex pattern for emails on targeted pages. Associate email with nearest detected role block. Handle obfuscation patterns (at, dot).	Python regex
3.4	Stakeholders table	Store: university_id, name, role, email, phone, source_url, confidence_score, linkedin_url (null initially)	Supabase
3.5	LinkedIn enrichment	Celery task: enrich_linkedin(stakeholder_id). Build Google query: '{name} {role} {university} site:linkedin.com'. Call Serper.dev API. Parse profile URL from result snippet. Store linkedin_url.	Serper.dev
3.6	News enrichment	Celery task: enrich_news(university_id). Query: '{university_name} news 2024'. Parse top 5 results. Extract title + snippet. Store in university_signals table with signal_type=news.	Serper.dev
3.7	NAAC signal	Separate query: '{university_name} NAAC accreditation grade'. Call Serper.dev. Detect A, A+, B++ mentions. Store signal_type=naac_grade, signal_value=grade.	Serper.dev
3.8	Priority scoring	Celery task: compute_priority(university_id). Apply deterministic scoring formula from PRD. Sum weights. Store in priority_scores table.	Python
3.9	AI scoring layer	For universities with deterministic_score > 50: send homepage text to LLM. Prompt for investment likelihood score 0-10. Add to final_score. Assign tier: High/Medium/Low.	OpenAI API
3.10	Enrichment dashboard	React page: per-university drill-down. Stakeholders list. LinkedIn status. News signals panel. Priority score badge.	React

PHASE 4: OUTREACH AUTOMATION ENGINE   ⏱ Day 11–16

Objectives
Build the complete email outreach system: template engine, tier-based cadence scheduler, delivery tracking, and reply classification.

#	Task	Details / Output	Tech / Tool
4.1	Email service	EmailService class wrapping SendGrid SDK. Methods: send_email(to, subject, html_body, metadata). Store every sent email in emails_sent table.	SendGrid
4.2	Template engine	Jinja2 templates for each email type: intro, followup_1, followup_2, final. Variables: {stakeholder_name}, {role}, {university}, {personalization_snippet}, {calendly_link}.	Jinja2
4.3	Personalization LLM	For High tier: call LLM with university signals to generate a 2-sentence personalization snippet referencing recent news/achievement.	OpenAI API
4.4	Cadence scheduler	Celery Beat periodic task: every 6hrs, query outreach_sequences for due emails. High: Day 0,3,7,14. Medium: Day 0,5,12. Low: Day 0 only. Create email job.	Celery Beat
4.5	Sequence manager	POST /api/outreach/start starts sequence for university. Creates outreach_sequences record with tier, next_email_date, sequence_step.	FastAPI
4.6	Webhook receiver	POST /api/webhooks/sendgrid receives delivery events: delivered, opened, clicked, bounced. Update email_status in emails_sent.	FastAPI
4.7	Inbound email parser	Configure SendGrid Inbound Parse webhook. POST /api/webhooks/email-reply. Extract from, subject, body text. Store in reply_logs.	SendGrid Inbound
4.8	Reply classifier	Celery task: classify_reply(reply_id). Send email body to LLM. Classify into: meeting_request, demo_request, info_request, budget_query, not_interested, auto_reply, opt_out.	OpenAI API
4.9	Action dispatcher	Based on classification: meeting_request → send Calendly link + notify sales. opt_out → pause sequence + mark opted_out. info_request → auto-respond with brochure.	Python
4.10	Outreach dashboard	React: pipeline kanban. Columns: Contacted, Replied, Meeting Booked, Proposal Sent, Converted. Drag cards between stages. Stats: open rate, reply rate by tier.	React

PHASE 5: MEETING BOOKING & PROPOSAL GENERATION   ⏱ Day 17–20

Objectives
Automate meeting booking confirmation and generate AI-powered, tailored proposals in PDF format when interest is detected.

#	Task	Details / Output	Tech / Tool
5.1	Calendly webhook	POST /api/webhooks/calendly. On invitee.created: mark university stage=meeting_scheduled. Extract meeting time, attendee. Notify sales team via email.	Calendly API
5.2	Auto agenda	On meeting scheduled: LLM generates meeting agenda based on university profile, tier, signals, stakeholder role. Send confirmation email with agenda.	OpenAI API
5.3	Proposal trigger	Trigger proposal generation when: meeting_scheduled OR reply classified as demo_request OR explicit interest detected.	Python
5.4	Proposal LLM prompt	Send to LLM: university data, signals, stakeholder role, tier score, detected pain points. Request structured JSON: executive_summary, identified_challenges, recommended_modules, implementation_timeline, expected_outcomes.	OpenAI API
5.5	Module recommender	Logic layer maps signals to Fretbox modules: hostel_pages→Hostel Mgmt, online_forms→Admission Workflow, NAAC→Compliance Dashboard, large_student_body→Lifecycle Automation.	Python
5.6	PDF generator	WeasyPrint or reportlab: render proposal JSON + Fretbox branding into styled PDF. Upload to Supabase Storage. Store public URL in proposals table.	WeasyPrint / Supabase
5.7	Proposal API	GET /api/proposals/{university_id} returns proposal list. POST /api/proposals/regenerate triggers fresh generation. GET /api/proposals/{id}/download returns public URL.	FastAPI
5.8	Proposal UI	React page: proposal card per university. Preview panel. Download button. Status: Draft / Sent / Accepted.	React

PHASE 6: TESTING, HARDENING & DEPLOYMENT   ⏱ Day 21–26

Objectives
Comprehensive testing, performance hardening, error monitoring, and full production deployment to Fly.io + Vercel.

#	Task	Details / Output	Tech / Tool
6.1	Unit tests	pytest suite for: Excel parser, role detector, scoring formula, email template rendering, reply classifier output parsing. Target >80% coverage.	pytest
6.2	Integration tests	End-to-end test with a seed university: ingest → website → stakeholders → score → outreach sequence creation. Use a test Supabase project.	pytest / httpx
6.3	Rate limit guards	Add per-domain rate limiting for Playwright scraper. Exponential backoff on CSE API 429s. Token bucket for LLM calls. Max 10 concurrent Celery tasks.	Python / Redis
6.4	Error monitoring	Integrate Sentry SDK in FastAPI + Celery. Capture unhandled exceptions + task failures. Set up Sentry project, DSN env var.	Sentry
6.5	Logging	Structured JSON logging via structlog. Log: task_id, university_id, step, duration, status for every pipeline step. Ship to Sentry or Logtail.	structlog
6.6	Fly.io backend deploy	fly.toml: 1 shared-cpu-1x instance. Deploy FastAPI app. Set all env vars via flyctl secrets set.	Fly.io / flyctl
6.7	Fly.io worker deploy	Separate Fly app for Celery worker + Celery Beat. Deploy from same Docker image with CMD override.	Fly.io
6.8	Vercel frontend deploy	Connect GitHub repo to Vercel. Set VITE_API_URL env var. Auto-deploy on main branch push.	Vercel
6.9	Smoke tests post-deploy	Run: health check, ingest 5 test universities, trigger website discovery, verify Celery tasks execute, check Supabase bucket upload, send 1 test email.	Manual / curl
6.10	Monitoring dashboard	Set up Fly.io metrics. Celery Flower for task monitoring. Create simple /admin/stats endpoint: universities_total, emails_sent, meetings_booked.	Flower / Fly

PART 3: COMPLETE DATABASE SCHEMA
Run these SQL statements in Supabase SQL Editor in order. All tables use UUID primary keys and include created_at/updated_at timestamps.

-- UNIVERSITIES
CREATE TABLE universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_name TEXT NOT NULL,
  state TEXT,
  city TEXT,
  affiliation TEXT,
  university_type TEXT,
  website_url TEXT,
  website_status TEXT DEFAULT 'new',
  outreach_stage TEXT DEFAULT 'new',
  opted_out BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- STAKEHOLDERS
CREATE TABLE stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  name TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  source_url TEXT,
  confidence_score FLOAT,
  linkedin_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRIORITY SCORES
CREATE TABLE priority_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id) UNIQUE,
  deterministic_score INT,
  ai_score FLOAT,
  final_score FLOAT,
  tier TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIVERSITY SIGNALS
CREATE TABLE university_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  signal_type TEXT,
  signal_value TEXT,
  weight INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OUTREACH SEQUENCES
CREATE TABLE outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  stakeholder_id UUID REFERENCES stakeholders(id),
  tier TEXT,
  sequence_step INT DEFAULT 0,
  next_email_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EMAILS SENT
CREATE TABLE emails_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  stakeholder_id UUID REFERENCES stakeholders(id),
  subject TEXT,
  sendgrid_message_id TEXT,
  email_status TEXT DEFAULT 'sent',
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- REPLY LOGS
CREATE TABLE reply_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  from_email TEXT,
  subject TEXT,
  body TEXT,
  classification TEXT,
  processed BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- PROPOSALS
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID REFERENCES universities(id),
  stakeholder_id UUID REFERENCES stakeholders(id),
  generated_content JSONB,
  pdf_url TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

PART 5: AGENT INTERACTION TIPS
To get the best results from your AI coding agent in Google Anti-Gravity IDE, follow these guidelines when interacting after the initial prompt:

Confirming Phase Completions
When the agent says 'Phase X Complete', verify by checking: all files exist, docker-compose up works cleanly, and the health endpoint returns 200. Only then type 'Phase 1 confirmed. Proceed to Phase 2.' This prevents the agent from skipping validation.

When the Agent Gets Stuck
If the agent produces an error or gets confused, use this recovery prompt:
You got an error on [describe what]. 
The error is: [paste exact error].
The file you were editing is: [filename].
Fix only this specific error. Do not refactor or change other files.
Show me the corrected code.

Requesting Specific Sub-Tasks
After the full build is complete, use targeted prompts like:
•	'Add rate limiting to the Playwright scraper: max 2 concurrent per domain, 3s delay between requests'
•	'Improve the priority scoring to also detect LinkedIn follower count if available in the CSE snippet'
•	'Add a retry mechanism to the proposal PDF generation if WeasyPrint fails'
•	'Write an integration test that ingests 10 sample universities and verifies the full pipeline'

Cost Control Reminders
Tell the agent explicitly if LLM costs need to be controlled. Example: 'When calling OpenAI for AI scoring, only use GPT-4o-mini for universities in the Medium tier. Reserve GPT-4o for High tier only.'

Document End — Fretbox Outreach AI Build Roadmap
