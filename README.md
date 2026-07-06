# Fretbox Outreach AI v2

AI-native outreach engine for university hostel management. Built on Convex + Next.js 15.

## 🚀 Quick Start

### 1. Project Initialization
```bash
# Install dependencies
npm install

# Start development environment
npx convex dev
npm run dev -- -p 3001
```

### 2. Environment Setup
Set these variables in your Convex dashboard (or via CLI):
- `GEMINI_API_KEY`: For Gemini models (stored via dashboard settings)
- `ZEPTOMAIL_API_KEY`: For email delivery (stored via dashboard settings)
- `SERPER_API_KEY`: For website discovery (stored via dashboard settings)
- `FIRECRAWL_API_KEY`: For web scraping (stored via dashboard settings)
- `GOOGLE_CALENDAR_WEBHOOK_TOKEN`: For calendar/proposal automation
- `SETTINGS_OBFUSCATION_SECRET`: For API key obfuscation in DB
- `LLM_DAILY_BUDGET_USD`: For LLM cost guardrails

### 3. Core Features
- **University Ingestion**: Bulk upload CSVs via the dashboard.
- **Automated Discovery**: AI finds university websites and scores them by potential.
- **Outreach Orchestrator**: Multi-step, personalized email sequences with Gemini 3.5 Flash.
- **Proposal Automation**: Google Calendar bookings trigger bespoke AI-generated PDF proposals.
- **Real-time Monitoring**: Polished glassmorphism dashboard for tracking deals.

## 🛠 Tech Stack
- **Backend/DB**: [Convex](https://convex.dev)
- **Frontend**: [Next.js 15](https://nextjs.org) + React 19 + Tailwind CSS
- **AI**: Gemini 3.5 Flash (Reasoning) + Gemini 3.1 Flash-Lite (Vision/Speed) + gemini-embedding-001
- **Email**: ZeptoMail
- **PDF**: @react-pdf/renderer
- **Scraping**: Firecrawl + Jina Reader + fetch

## 🛡 Hardening
- **Monitoring**: Sentry error tracking and performance profiling integrated into background actions.
- **Resilience**: Exponential backoff with `withRetry` for all external API calls.
- **Intelligence**: Centralized prompt library in `convex/lib/prompts.ts` for unified AI governance.
- **Optimization**: Batch mutations for high-frequency signal ingestion.
- **Security**: Convex native authentication and protected API endpoints.

---
© 2026 Fretbox. Confidential.
