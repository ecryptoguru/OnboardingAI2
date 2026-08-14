# Fix Jamia Hamdard (and future) enrichment pipeline

## Goal
Make the production re-enrichment pipeline produce accurate, verified stakeholders for Jamia Hamdard and all future universities by fixing scraper over-extraction, deep-enrichment under-extraction, and unverified contact/link attachment.

## Root causes
1. **Scraper over-extracts** — `SCRAPER_SYSTEM_PROMPT` tells the model to "extract EVERY person" and the role list is 50+ long; `gemini-3.5-flash-lite` misread it as a concatenated role and produced 50+ generic "Dean of Faculty" / "Head of Administration" records.
2. **Deep enrichment under-extracts** — per-source extraction uses `gemini-3.5-flash-lite` with only `maxOutputTokens: 2048` and a 12-item schema, so it only found 3 stakeholders on a page that has a full Officers table with 10+ named officials.
3. **Unverified phones/LinkedIn** — regex phone matching attaches any phone in the same context to a role, and social discovery's LinkedIn-name matching is looser than deep enrichment's. Both attach wrong contacts.

## Tasks

- [x] **T1: Model upgrade** → Per-source extraction and merge use `gemini-3.6-flash`; per-source `maxItems` raised to 25 and `MAX_PARTIAL_SOURCES` set to 6.
  - Verified: Jamia dry-run now returns 20 stakeholders from the official officers table.
- [x] **T3: Deep-enrichment table extraction** → `STAKEHOLDERS_SYNTHESIS_PROMPT` and `STAKEHOLDERS_MERGE_PROMPT` explicitly handle Officers tables, require every named row, preserve Offg./Acting labels, and resolve singleton-role conflicts in favour of the current officers table / leadership leaf pages.
  - Verified: `actions/deepEnrichment:runDeepEnrichment` dry-run returns Chancellor, VC (Offg.), Registrar, Finance Officer (Offg.), Controller of Examinations, all Deans, and other officers.
- [x] **T4: Harden contact inference** → `matchPhonesToStakeholders` now uses proximity (character distance within ±100 context), and `collectFallbackPhonesForStakeholder` only returns phones explicitly matched to a name; LinkedIn inference remains strict (slug contains surname / two+ tokens). Role-based emails are stripped when not explicitly associated with the identified person.
  - Verified: production Jamia re-enrichment has no phones and no LinkedIn; mismatched `vc@`, `fo@`, etc. were stripped.
- [x] **T5: End-to-end production re-run** → Ran `wipeEnrichment:clearSingleUniversityEnrichmentInternal` followed by `actions/deepEnrichment:runDeepEnrichment` on production; 19 stakeholders persisted. Ran `python3 .devin/scripts/checklist.py .` — all checks pass.
- [ ] **T6: Batch website re-validation** → Run over all universities after Jamia is accepted.
- [ ] **T2/T7: Email approvals guard and enrichment UI progress** → Already partially implemented; confirm and finalize.

## Done when
- [x] Dry-run on Jamia Hamdard returns only accurate, current officials from official `.ac.in` sources.
- [x] No concatenated roles, no wrong LinkedIn, no unverified phone numbers.
- [x] `npx tsc --noEmit` and `npm run lint` pass.

## 2026-08-14 final verification
- Deployed to production.
- Re-ran full `actions/orchestrator:runEnrichmentChainInternal` on Jamia Hamdard, Gondwana University, and Indian Institute of Heritage.
- `gemini-3.6-flash` verified working via API (`:generateContent` with `thinkingConfig` + JSON schema) and via the SDK path (`actions/liveTest:testGeminiModel` — extracted 2 Jamia officials correctly). `MODELS.gemini`/`MODELS.complex` now point to `gemini-3.6-flash`; `gemini-3.5-flash-lite` is unchanged and still used by per-source extraction, scraper, and government-data paths.

## 2026-08-14 model upgrade + hardening (megaplan)

- **Gemini 3.7**: `gemini-3.7-flash` verified via API and SDK (GA 2026-08-13). `MODELS.gemini`, `MODELS.complex`, per-source extraction, and merge now use `gemini-3.7-flash` (intro pricing $0.75/$3.75 per 1M through 2026-12-31, then $1.50/$7.50). Per-source/merge fallback stays `gemini-3.5-flash-lite`. Scraper, government data, scoring, personalize unchanged on flash-lite.
- **`isGemini3Model` fixed**: 3.5-flash (non-lite) / 3.6 / 3.7+ are 3.x (thinkingLevel); flash-lite models are legacy (no thinkingConfig). 3.7 rejects `MINIMAL`, so default is `LOW`.
- **Cost accuracy**: `createLlmUsageEntry` now bills thinking tokens at the output rate (official pricing includes them) and records `thoughtsTokenCount`.
- **Provenance coalescing**: `bulkUpsertInternal` no longer lets a new `"none"` source clobber a preserved phone/LinkedIn/email source.
- **Dedup matching**: `namesEquivalent` (initials ↔ full names) added; same-name/different-role rows merge only when contact evidence links them or one side has none.
- **Cleanup action**: `actions/stakeholderCleanup:cleanupStakeholders` (dry-run first) deletes scraper/inferred duplicates of deep records, strips unverified phone/LinkedIn from scraper rows without `source_url`, and backfills `linkedin_source`/`phone_source`/`email_source`.
- **Deep enrichment robustness**: gov.in snippet fallback (Serper snippets for blocked sites, e.g. `nmi.gov.in`); orchestrator reports `warnings` when deep returns 0 stakeholders; Firecrawl concurrency 4→2, credit cap 15/run, stronger backoff; PDF parsing moved from `pdfjs-dist` to `unpdf` (no worker/canvas, works in Convex bundle).
- Validation passed: `npm run lint`, `npx tsc --noEmit`, `npm run test:unit` (483/484), `python3 .devin/scripts/checklist.py .`.
- `npm audit fix` applied (non-breaking): 11 → 4 remaining (2 high `next`/`sharp`, 2 critical `@auth/core`) which need breaking upgrades — deferred.
