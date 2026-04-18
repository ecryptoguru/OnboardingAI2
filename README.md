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
- `OPENROUTER_API_KEY`: For Claude 3.7 & Gemini 2.5 Flash
- `GOOGLE_API_KEY`: For text-embedding-004
- `SENDGRID_API_KEY`: For email delivery
- `SERPER_API_KEY`: For website discovery
- `CALENDLY_WEBHOOK_SECRET`: For proposal automation

### 3. Core Features
- **University Ingestion**: Bulk upload CSVs via the dashboard.
- **Automated Discovery**: AI finds university websites and scores them by potential.
- **Outreach Orchestrator**: Multi-step, personalized email sequences with Claude 3.7.
- **Proposal Automation**: Calendly bookings trigger bespoke AI-generated PDF proposals.
- **Real-time Monitoring**: Polished glassmorphism dashboard for tracking deals.

## 🛠 Tech Stack
- **Backend/DB**: [Convex](https://convex.dev)
- **Frontend**: [Next.js 15](https://nextjs.org) + React 19 + Tailwind CSS
- **AI**: Gemini 3.1 Pro (Reasoning) + Gemini 3.1 Flash Lite (Vision/Speed)
- **Email**: SendGrid
- **PDF**: @react-pdf/renderer
- **Scraping**: fetch + Jina Reader

## 🛡 Hardening
- **Monitoring**: Sentry error tracking and performance profiling integrated into background actions.
- **Resilience**: Exponential backoff with `withRetry` for all external API calls.
- **Intelligence**: Centralized prompt library in `convex/lib/prompts.ts` for unified AI governance.
- **Optimization**: Batch mutations for high-frequency signal ingestion.
- **Security**: Convex native authentication and protected API endpoints.

---
© 2026 Fretbox. Confidential.
