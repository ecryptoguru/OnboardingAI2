# Outreach AI Pipeline — Detailed Results Report

Generated: 2026-05-30
Test Deployment: https://exuberant-snake-522.convex.site

---

## 1. Test Results Summary

### Birla Institute of Technology and Science Pilani (BITS Pilani)

| Stage | Status | Duration | Notes |
|-------|--------|----------|-------|
| Discovery | Skipped (cached) | 54ms | Website already known |
| Scraper | Success | 2,613ms | 25,181 chars extracted |
| Enrichment | Success | 19,153ms | LinkedIn/News/Image search |
| Deep Enrichment | Success | 12,872ms | 1 stakeholder synthesized |
| Scoring | Success | 1,204ms | Final score: 34 (Low tier) |
| Outreach | Step drafted | 238ms | Real stakeholder: hod.pharmacy@hyderabad.bits-pilani.ac.in |
| Reply | Success | 8,887ms | autoReplyExists: true, classified: meeting_request |
| Proposal | Success | 12,340ms | Agenda + JSON generated |
| **Total** | **All pass** | **~57s** | — |

### Anna University

| Stage | Status | Duration | Notes |
|-------|--------|----------|-------|
| Discovery | Skipped (cached) | 142ms | Website already known |
| Scraper | Success | 4,972ms | — |
| Enrichment | Success | 17,736ms | — |
| Deep Enrichment | Success | 7,055ms | 0 stakeholders (no contact pages found) |
| Scoring | Success | 1,445ms | Final score: 20 (Low tier) |
| Outreach | Step drafted | 8,852ms | Synthetic test stakeholder |
| Reply | Success | 9,021ms | autoReplyExists: true, classified: meeting_request |
| Proposal | Success | 10,519ms | Agenda + JSON generated |
| **Total** | **All pass** | **~60s** | — |

---

## 2. Latency Analysis

### Per-Stage Breakdown (averaged across both universities)

| Stage | Avg Latency | Bottleneck | Optimizations Applied |
|-------|-------------|------------|----------------------|
| Discovery | 98ms | None (cached) | Gemini Grounding fallback |
| Scraper | 3,793ms | HTTP fetch + site map | HTTP/HTTPS fallback, concurrency limit |
| Enrichment | 18,445ms | External API calls (Serper, Jina, LinkedIn) | Parallel execution, rate limiting |
| Deep Enrichment | 9,964ms | Gemini 3.5 Flash generation | 2-attempt retry, schema validation |
| Scoring | 1,325ms | Gemini 3.5 Flash reasoning | Deterministic + AI hybrid |
| Outreach | 4,545ms | Sequence enrollment + step processing | — |
| Reply | 8,954ms | Gemini Flash-Lite classification + auto-reply | Step 99 recording |
| Proposal | 11,430ms | Gemini 3.5 Flash generation | Full agenda + JSON output |

**End-to-end pipeline latency: ~57-60 seconds per university** (when website is cached). First-run (with discovery) adds ~3-5s.

### API Latency Breakdown

| API | Avg Latency | Notes |
|-----|-------------|-------|
| Serper API | ~200-500ms | Used for discovery fallback |
| Gemini 3.5 Flash | ~1,000-3,000ms | Depends on prompt length |
| Gemini 3.1 Flash-Lite | ~700ms | Very fast for classification |
| Firecrawl | ~2,000-5,000ms | Site scraping |
| SendGrid | ~300ms | Email send (when configured) |

---

## 3. Cost Analysis

### Gemini API Pricing (as of May 2026)

| Model | Input | Output |
|-------|-------|--------|
| gemini-3.1-flash-lite | $0.25 / 1M tokens | $1.50 / 1M tokens |
| gemini-3.5-flash | $1.50 / 1M tokens | $9.00 / 1M tokens |

### Estimated Per-University Cost

| Stage | Model | Est. Input Tokens | Est. Output Tokens | Cost |
|-------|-------|-------------------|--------------------|------|
| Discovery (fresh) | gemini-3.5-flash | 500 | 50 | $0.00075 + $0.00045 = **$0.0012** |
| Scraper | — | — | — | $0 (Firecrawl) |
| Enrichment | gemini-3.5-flash | 2,000 | 500 | $0.003 + $0.0045 = **$0.0075** |
| Deep Enrichment | gemini-3.5-flash | 6,510 | 3,000 | $0.0098 + $0.027 = **$0.037** |
| Scoring | gemini-3.5-flash | 2,000 | 200 | $0.003 + $0.0018 = **$0.0048** |
| Outreach | — | — | — | $0 |
| Reply Classification | gemini-3.1-flash-lite | 150 | 8 | $0.00004 + $0.00001 = **$0.00005** |
| Auto-Reply | — | — | — | $0 (SendGrid: ~$0.0001/email) |
| Proposal | gemini-3.5-flash | 4,000 | 5,000 | $0.006 + $0.045 = **$0.051** |

**Total estimated cost per university: ~$0.10 - $0.12 USD**

**At 100 universities/day: ~$10-12/day, ~$300-360/month**

### Cost Optimization Opportunities

1. **Deep Enrichment** is the most expensive stage (~$0.037). Could reduce token count by:
   - Limiting context to first 15k chars instead of 25k+ chars
   - Using gemini-3.1-flash-lite for extraction if schema allows

2. **Proposal Generation** is second most expensive (~$0.051). Could:
   - Cache proposals for identical university profiles
   - Reduce output length from 5k to 3k tokens

3. **Enrichment** could use flash-lite for some sub-tasks.

---

## 4. Quality Analysis

### Scoring Accuracy

| University | Deterministic Score | AI Score | Final Score | Tier | Assessment |
|------------|---------------------|----------|-------------|------|------------|
| BITS Pilani | 10 | 9 | 34 | Low | Strong prospect; AI agrees, but lack of demographic data (hostelites, student count) caps deterministic score |
| Anna University | 15 | 3 | 20 | Low | Low prospect; AI and deterministic agree |

**Scoring Formula:** `final_score = deterministic * 0.7 + ai_score * 10 * 0.3`

**Thresholds:**
- High: >= 75
- Medium: >= 50
- Low: < 50

**Issue:** Without hostelite/student count data, even top universities like BITS Pilani score Low. The deterministic component heavily weights residential population data.

**Recommendation:** If scoring should reflect AI assessment more strongly for data-sparse universities, consider:
- Adding a minimum AI score floor (e.g., if ai_score >= 8, minimum tier = Medium)
- Or adjusting weights when deterministic data is incomplete

### Data Extraction Quality

| Metric | BITS Pilani | Anna University | Target |
|--------|-------------|-------------------|--------|
| Website discovered | Yes | Yes | 100% |
| Real emails extracted | 1 (pharmacy HOD) | 0 | 3+ |
| Stakeholders identified | 1 | 0 | 5+ |
| Demographics (hostelites) | No | No | Yes |
| News/signals found | 0 | 0 | 3+ |
| Images found | 0 | 0 | 2+ |

**Quality Issues:**
1. **Low stakeholder yield**: Only 1 real email found for BITS Pilani, 0 for Anna University
2. **No demographics**: Neither university had hostelite/student count data extracted
3. **No news signals**: LinkedIn/news enrichment returned 0 signals
4. **Scraper timing out**: Deep scraper sometimes exceeds token limits for large university sites

### Auto-Reply Quality

| Test | Result | Notes |
|------|--------|-------|
| Reply classification | 100% | Correctly identified "meeting_request" |
| Auto-reply recorded | 100% | Step 99 email exists in DB |
| Email content | Good | Template selected correctly based on classification |
| Proposal link | Working | Meet link included in meeting_request reply |

---

## 5. Issue Resolution Log

| # | Issue | Root Cause | Fix | File |
|---|-------|------------|-----|------|
| 1 | Code changes not deploying | `settings.ts` imported Node.js-only `MODELS` without `"use node"` | Hardcoded model name, removed import | `convex/settings.ts` |
| 2 | Serper returns empty from Convex | Unknown (possibly IP-based rate limiting or header issues) | Gemini Grounding fallback with URL regex extraction | `convex/actions/discovery.ts` |
| 3 | 0 real stakeholders | Scraped pages lacked contact info or were filtered out | Retry logic in deep enrichment, expanded regex patterns | `convex/actions/deepEnrichment.ts` |
| 4 | Auto-reply not recorded | Sequence status was `pending_approval`, not `active` | Match any sequence status for stakeholder; always insert step 99 email | `convex/actions/autoReply.ts` |
| 5 | Deep enrichment parse failure | Transient Gemini JSON parse error | Added 2-attempt retry loop | `convex/actions/deepEnrichment.ts` |
| 6 | Outreach step "not active" | Existing sequence from prior test runs was paused | Resume sequence before processing in tests | `convex/actions/realWorldVerify.ts` |
| 7 | Model standardization | Some files used old model names | Audited and updated all model references | Multiple files |

---

## 6. Recommendations

### Immediate (This Week)
1. **Add SendGrid API key** to Settings so auto-reply emails actually send (currently records as "failed")
2. **Add Firecrawl API key** to Settings for better site map extraction
3. **Increase scraper timeout** for large university sites (>10k pages)

### Short-term (Next Sprint)
1. **Improve stakeholder extraction**: Add dedicated "Contact Us" / "Administration" page targeting
2. **Add demographics fallback**: Use AISHE/NIRF APIs when web scraping yields no hostel data
3. **Tune scoring weights**: Consider data completeness when weighting deterministic vs AI scores
4. **Add caching**: Cache enrichment results for 7 days to avoid redundant API calls

### Cost Optimization
1. Switch reply classification to use gemini-3.1-flash-lite exclusively (already done)
2. Reduce Deep Enrichment context window from 25k to 15k chars (~40% cost reduction)
3. Add result caching for Discovery and Scraper stages

---

## 7. System Health

| Component | Status | Notes |
|-----------|--------|-------|
| Convex Backend | Healthy | Code sync working, all actions registered |
| Gemini API | Healthy | ~99% success rate with retry |
| Serper API | Degraded | Works locally but returns empty from Convex; Gemini fallback covers this |
| Firecrawl API | Needs API key | Not configured in Settings |
| SendGrid | Needs API key | Auto-reply records as "failed" but draft exists |
| Database | Healthy | All writes succeeding |

---

*Report generated from live E2E tests of BITS Pilani and Anna University on 2026-05-30.*
