# Deep Enrichment Dry-Run Comparison — v2 per-source pipeline

**Deployment:** `prod:energetic-raven-535`  
**Run date:** 2026-08-08  
**Action:** `actions/deepEnrichment:runDeepEnrichment` with `dryRun: true` (no DB writes)  
**Previous baseline:** `results/deep_enrichment_3_universities_results.md`

---

## Quick summary

| University | Stakeholders (new) | Stakeholders (old) | Demographics (new) | Demographics (old) | LLM cost | LLM tokens | Context chars | Firecrawl credits |
|---|---|---:|---|---:|---:|---:|---:|---:|
| NIT Delhi | 15 | 9 | none | hostelites: 800 | $0.03036 | 40,605 | 42,350 | 23 |
| VNIT Nagpur | 7 | 0 | none | none | $0.02893 | 40,732 | 40,056 | 23 |
| Anna University | 2 | 0 | none | none | $0.02334 | 30,822 | 20,248 | 23 |
| **Total** | **24** | **9** | **none** | **1 field** | **$0.08263** | **112,159** | — | **69** |

*Note: old run total cost was $0.131 including Firecrawl. New run LLM-only cost is $0.083; Firecrawl credits are now 23 per university vs 4 per university in the old run, so total third-party spend is likely higher.

---

## 1. National Institute of Technology Delhi

**Convex id:** `kn7akh0c20580226wnh8v63gyx86fnj2`  
**Website:** https://nitdelhi.ac.in/

### 1.1 Discovery & scraping (new)

- Firecrawl map: 162 URLs, 9 high-yield targets selected.
- External search: 5 sources discovered and scraped.
- Follow-up leadership leaf links: 8 added (total 22 sources).
- Regex fallback: 25 emails, 2 phones.
- Context: 42,350 chars.

### 1.2 LLM usage (new)

| Calls | Input tokens | Output tokens | Cost |
|---:|---:|---:|---:|
| 6 (5× flash-lite per-source + 1× flash merge) | 33,087 | 4,206 | $0.03036 |

### 1.3 Demographics

| Field | Old | New |
|---|---|---|
| `data_quality` | `partial` | `partial` |
| `hostelites` | **800** | **missing** |
| `source` / `source_urls` | `context_regex_fallback` | 9 source URLs |

**Regression:** The new per-source + merge pipeline did **not** extract any demographic numbers, even though NIRF/source pages were included. Only empty `source_urls` were returned.

### 1.4 Stakeholders

**Old (9 stakeholders):**

| Name | Role | Email | Phone |
|---|---|---|---|
| Ms. Anupriya Das | Senior Assistant | — | +91-11-33861005 |
| Mr. Vishal Verma | Senior Assistant | — | +91-11-33861007 |
| Dr. Manisha Singh | Dy Registrar | dr@nitdelhi.ac.in | +91-11-33861011 |
| Mr. Lov Kumar Dubey | Senior Office Attendant | — | +91-11-33861013 |
| Ms. Dimple Gupta | Assistant Registrar | — | +919267998697 |
| Prof. Dr. Jyoteesh Malhotra | Dean Research and Consultancy | — | +91-11-33861104 |
| Dr. V S Pandey | Dean Student Welfare | — | +91-11-33861103 |
| Prof. (Dr.) Manoj Kumar | Dean Faculty Welfare | — | +91-11-33861107 |
| Dr. Obbu Chandra Sekhar | Dean (Planning and Development) | — | +91-11-33861102 |

**New (15 stakeholders):**

| Name | Role | Source URL |
|---|---|---|
| Prof. (Dr.) Ajay K. Sharma | Director | https://nitdelhi.ac.in/institute/leadership/director-profile |
| Prof. (Dr.) Hitesh Sharma | Registrar | https://nitdelhi.ac.in/institute/leadership/registrar |
| Prof. (Dr.) Geeta Sikka | Dean Academic | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Prof. (Dr.) Ujjwal Kumar Kalla | Dean Startup & IPR | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Prof. (Dr.) Obbu Chandra Sekhar | Dean Planning and Development | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Prof. (Dr.) Jyoteesh Malhotra | Dean Research and Consultancy | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. V S Pandey | Dean Student Welfare | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Harish Kumar | Dean Faculty Welfare | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Kapil Kumar | Associate Dean (Int. Affairs & Outreach) | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Amit Mahajan | Associate Dean (Academic) | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Shailesh Mani Pandey | Associate Dean (Research & Consultancy) | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Rikmantra Basu | Associate Dean (Faculty Welfare) | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Ankur | Associate Dean (Planning & Development) | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Manisha Bharti | Associate Dean (Student Welfare) | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |
| Dr. Manoj Kumawat | Associate Dean (Startup & IPR) | https://nitdelhi.ac.in/institute/leadership/deans-associate-deans |

**Improvement:** Stakeholder count and quality are much better. New run found the actual Director, Registrar, and all Deans/Associate Deans with source URLs.  
**Concern:** Phone numbers are heavily shared (`+91-11-33861001` and `+919828288334` appear for many stakeholders) — office-level numbers, not individual mobiles.

---

## 2. Visvesvaraya National Institute of Technology, Nagpur

**Convex id:** `kn7d4ac08nz6b51zzbcx8gb42x86eytp`  
**Website:** https://vnit.ac.in/

### 2.1 Discovery & scraping (new)

- Firecrawl map: 550 URLs, 9 high-yield targets selected.
- External search: 5 sources discovered and scraped.
- Follow-up: 8 leaf pages (including NIRF PDFs), total 22 sources.
- Regex fallback: 24 emails, 18 phones.
- Context: 40,056 chars.
- One fallback to Jina Reader when Firecrawl failed on `https://vnit.ac.in/registrar`.

### 2.2 LLM usage (new)

| Calls | Input tokens | Output tokens | Cost |
|---:|---:|---:|---:|
| 6 | 30,875 | 3,750 | $0.02893 |

### 2.3 Demographics

| Field | Old | New |
|---|---|---|
| Demographics | none | none |

No change. VNIT still yields no demographic numbers in deep enrichment.

### 2.4 Stakeholders

**Old:** 0 stakeholders.

**New (7 stakeholders):**

| Name | Role | Email | Phone | Source URL |
|---|---|---|---|---|
| Dr. Rupali Rakhunde | Superintendent (S.G.- II) | rupalirakhunde@vnit.ac.in | +917122801370 | https://vnit.ac.in/director-office-staff-2 |
| Ms. Rajni Pillai | Senior Assistant | rajnikale50@gmail.com | +917122801301 | https://vnit.ac.in/director-office-staff-2 |
| Mr. Rakesh Vishwakarma | Senior Assistant | rakeshvishwakarma@vnit.ac.in | +917122801302 | https://vnit.ac.in/director-office-staff-2 |
| Mr. Sharad Ramteke | Senior Technician | rsharad@vnit.ac.in | +917122801304 | https://vnit.ac.in/director-office-staff-2 |
| Mr. Karan Thakre | Stenographer | karanthakare@vnit.ac.in | +918007414209 | https://vnit.ac.in/director-office-staff |
| Ms. Samiksha Alat | Junior Assistant | samikshaalat@vnit.ac.in | +917122801370 | https://vnit.ac.in/director-office-staff |
| Mr. Amol Sakharwade | Office Attendant | amolsakharwade@vnit.ac.in | +918698531197 | https://vnit.ac.in/director-office-staff |

**Improvement:** VNIT went from 0 to 7 extractable stakeholders. The director-office-staff pages were found and parsed.  
**Concern:** Roles are support staff, not senior decision makers (Director/Registrar/Dean). The `stakeholdersSynthesized` return field reported `15` but the final returned array has 7 (known display bug in the return value).

### 2.5 Runtime

- Merge model `gemini-3.5-flash` took 46.7s and triggered a high-latency warning.
- Total LLM time was ~50s.

---

## 3. Anna University, Chennai

**Convex id:** `kn74npsv28sqb9cynv7ae0jafx86fvfe`  
**Website:** http://www.annauniv.edu

### 3.1 Discovery & scraping (new)

- Firecrawl map: 79 URLs, 9 high-yield targets selected.
- External search: 5 sources discovered and scraped.
- Follow-up: 8 leaf pages, total 22 sources.
- Regex fallback: 30 emails, 2 phones.
- Context: 20,248 chars.

### 3.2 LLM usage (new)

| Calls | Input tokens | Output tokens | Cost |
|---:|---:|---:|---:|
| 6 | 25,156 | 2,604 | $0.02334 |

### 3.3 Demographics

| Field | Old | New |
|---|---|---|
| Demographics | none | none |

No change. Anna University still yields no demographic numbers in deep enrichment.

### 3.4 Stakeholders

**Old:** 0 stakeholders.

**New (2 stakeholders):**

| Name | Role | Email | Phone | Source URL |
|---|---|---|---|---|
| Priya Sethuraman | Deputy Registrar | priyasethuramandr@annauniv.edu | +919994127117 | https://www.annauniv.edu/officers.php |
| Velmani | Deputy Registrar | velmanidr@annauniv.edu | +919994127117 | https://www.annauniv.edu/officers.php |

**Improvement:** Anna went from 0 to 2 qualifying stakeholders. The `officers.php` page was correctly discovered.  
**Concern:** `stakeholdersSynthesized` reported `10` while final array has 2 (same return-value bug). The shared phone number `+919994127117` is likely an office number.

### 3.5 Runtime

- Merge model `gemini-3.5-flash` hit `DEADLINE_EXCEEDED` twice and retried 3 times before completing in **92.4s**.
- Total action time was ~95s.

---

## Aggregate numbers

| Metric | Old run | New dry-run | Delta |
|---|---:|---:|---|
| Universities with stakeholders | 1 / 3 | 3 / 3 | +2 |
| Total stakeholders | 9 | 24 | +15 (+167%) |
| Universities with demographics | 1 / 3 | 0 / 3 | **-1** |
| LLM input tokens | 36,843 | 112,159 | +75,316 (+204%) |
| LLM output tokens | 1,377 | 10,560 | +9,183 (+667%) |
| LLM cost | ~$0.0128 | $0.0826 | +$0.0698 (+545%) |
| Firecrawl credits per university | 4 | 23 | +19 (+475%) |

---

## Observations

1. **Stakeholder quality and count improved dramatically.** The per-source extraction + new URL scoring found leadership/admin pages that the previous run missed for VNIT and Anna.
2. **Demographics regression.** The new pipeline did not extract any numeric demographic values (total students, hostelites, day scholars, NIRF gender splits) for any university. Only `source_urls` and `data_quality` were returned.
3. **Cost and token usage increased.** More LLM calls (6 per university vs 1) and far more Firecrawl scrapes (22 vs ~3-4) push the price up.
4. **Latency concern on `gemini-3.5-flash` merge.** VNIT merge took 47s; Anna merge timed out twice and took 92s. This is close to Convex action limits.
5. **Return field bug.** `stakeholdersSynthesized` in the action response does not match the length of the returned `stakeholders` array (VNIT: 15 vs 7; Anna: 10 vs 2).

---

## Raw commands used

```bash
npx convex deploy
npx convex run actions/deepEnrichment:runDeepEnrichment '{"universityId":"kn7akh0c20580226wnh8v63gyx86fnj2","dryRun":true}'
npx convex run actions/deepEnrichment:runDeepEnrichment '{"universityId":"kn7d4ac08nz6b51zzbcx8gb42x86eytp","dryRun":true}'
npx convex run actions/deepEnrichment:runDeepEnrichment '{"universityId":"kn74npsv28sqb9cynv7ae0jafx86fvfe","dryRun":true}'
```

All three were run against the production deployment with `dryRun: true`, so no database records were modified.
