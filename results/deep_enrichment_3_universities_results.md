# Deep Enrichment Results — 3 Universities

**Deployment:** `prod:energetic-raven-535` (`.env` `CONVEX_DEPLOYMENT`)  
**Run date:** 2026-08-04  
**Actions used:**
- `actions/deepEnrichment:debugDeepEnrichment` (read-only phase trace)
- `actions/liveTest:runLiveDeepEnrichmentTest` (live run, writes to DB)

**Universities selected:**
1. National Institute of Technology Delhi (NIT Delhi)
2. Visvesvaraya National Institute of Technology, Nagpur (VNIT)
3. Anna University, Chennai

---

## Quick summary

| University | Website | Latency | Cost | Quality | Stakeholders | Demographics |
|---|---|---:|---:|---|---:|---|
| NIT Delhi | https://nitdelhi.ac.in/ | 57.09 s | $0.0443 | Excellent (90) | 9 | hostelites: 800 |
| VNIT Nagpur | https://vnit.ac.in/ | 67.41 s | $0.0441 | Poor (0) | 0 | none |
| Anna University | http://www.annauniv.edu | 18.11 s | $0.0427 | Poor (0) | 0 | none |
| **Total** |  | **142.62 s** | **$0.1310** |  | **9** |  |

Only **NIT Delhi** produced extractable stakeholders and demographics. VNIT and Anna University completed without errors but the deep enrichment pipeline found no qualifying stakeholders or demographics.

---

## 1. National Institute of Technology Delhi

**Convex id:** `kn7akh0c20580226wnh8v63gyx86fnj2`  
**City/State:** New Delhi, Delhi  
**Website:** https://nitdelhi.ac.in/

### 1.1 Debug trace

- **Keys present:** gemini, firecrawl, serper — all `true`
- **Firecrawl map:** 199 links discovered. Top 10 included high-value pages:
  - `https://nitdelhi.ac.in/`
  - `https://nitdelhi.ac.in/institute/about/nit`
  - `https://nitdelhi.ac.in/institute/administration/office`
- **External search (Serper):** 3 URLs
  - `https://nitdelhi.ac.in/institute/administration/office`
  - `https://nitdelhi.ac.in/`
  - `https://nitdelhi.ac.in/institute/about/nit`
- **Jina scrapes:**
  - Home page — 46,796 chars
  - About NIT — 4,686 chars
  - Administrative Offices — 9,098 chars (contains Director/Registrar/Dean tables)
- **Contact page:** request timed out
- **Regex scan of top 10 map links:** 73 email-like strings + 1 phone (`+91-11-33861005`). Many strings were asset URLs (PDFs/images), but real admin emails such as `secretary@nitdelhi.ac.in`, `dr@nitdelhi.ac.in` and `manishabharti@nitdelhi.ac.in` were present.

### 1.2 Live enrichment metrics

| Metric | Value |
|---|---:|
| Latency | 57.09 s |
| Input tokens | 11,698 |
| Output tokens | 915 |
| Input cost | $0.00293 |
| Output cost | $0.00137 |
| Firecrawl credits | 4 |
| Firecrawl cost | $0.04 |
| **Total cost** | **$0.0443** |
| Quality score | 90 / 100 |
| Quality rating | Excellent |

### 1.3 Demographics

```json
{
  "data_quality": "partial",
  "hostelites": 800,
  "source": "context_regex_fallback"
}
```

### 1.4 Stakeholders persisted (source = `deep_enrichment`)

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

The DB now holds **10** stakeholders for this university (the 9 above plus one anti-ragging committee record).

**Outreach stage after run:** `enriched`

---

## 2. Visvesvaraya National Institute of Technology, Nagpur

**Convex id:** `kn7d4ac08nz6b51zzbcx8gb42x86eytp`  
**City/State:** Nagpur, Maharashtra  
**Website:** https://vnit.ac.in/

### 2.1 Debug trace

- **Keys present:** all `true`
- **Firecrawl map:** 575 links discovered. Top 10 were mostly author/category/blog pages, not admin contacts:
  - `https://vnit.ac.in/author/admin`
  - `https://vnit.ac.in/author/upload_siteweb`
  - `https://vnit.ac.in/author/vnit_web`
  - `https://vnit.ac.in/category/news-events`
  - ...
- **External search (Serper):** 3 URLs
  - `https://vnit.ac.in/`
  - `https://vnit.ac.in/section/academics/admission/`
  - `https://vnit.ac.in/contact-us/`
- **Jina scrapes:**
  - Home page — timed out
  - Contact Us — 26,995 chars
  - Academics/admission — timed out
- **Contact page** (`/contact`) — 26,101 chars loaded, but no emails/phones extracted by the page regex.
- **Regex scan of top 10 map links:** 0 emails, 0 phones.

### 2.2 Live enrichment metrics

| Metric | Value |
|---|---:|
| Latency | 67.41 s |
| Input tokens | 14,470 |
| Output tokens | 290 |
| Input cost | $0.00362 |
| Output cost | $0.00044 |
| Firecrawl credits | 4 |
| Firecrawl cost | $0.04 |
| **Total cost** | **$0.0441** |
| Quality score | 0 / 100 |
| Quality rating | Poor |

### 2.3 Extraction result

- **Demographics:** none
- **Stakeholders (source = `deep_enrichment`):** none

### 2.4 DB state after run

- **Outreach stage:** `enriched`
- **Stakeholders count:** 0

### 2.5 Diagnosis

The Firecrawl map returned many low-value author/category links first, so the branch-scoped and high-yield URL selection did not surface administration or leadership pages. The contact-page regex found no parseable email/phone in the rendered WordPress page, and the top-10 regex scan was empty. A more targeted admin/leadership URL guesser (e.g. `/administration`, `/leadership`) or a deeper Serper query for VNIT’s director/registrar would likely help.

---

## 3. Anna University, Chennai

**Convex id:** `kn74npsv28sqb9cynv7ae0jafx86fvfe`  
**City/State:** Chennai, Tamil Nadu  
**Website:** http://www.annauniv.edu

### 3.1 Debug trace

- **Keys present:** all `true`
- **Firecrawl map:** 104 links discovered. Top 10 included:
  - `https://www.annauniv.edu`
  - `https://www.annauniv.edu/cir/pdf/tf_2.pdf`
  - `https://www.annauniv.edu/BioTech/faculty.html`
  - `https://www.annauniv.edu/cai/Affiliated%20Colleges%20list%20by%20Alphabetical/N.html`
  - `https://www.annauniv.edu/litclub`
  - `https://www.annauniv.edu/rusa`
- **External search (Serper):** 3 URLs
  - `https://www.annauniv.edu/nirf.php`
  - `https://www.annauniv.edu/contactus.php`
  - `https://www.annauniv.edu/administration.php`
- **Jina scrapes:**
  - Administration — 23,183 chars
  - Contact Us — 22,733 chars
  - NIRF — 25,985 chars
- **Contact page** (guessed `/contact`) — returned 404 (page does not exist; the real page is `contactus.php`)
- **Regex scan of top 10 map links:** 1 email (`dac@annauniv.edu`), 0 phones

### 3.2 Live enrichment metrics

| Metric | Value |
|---|---:|
| Latency | 18.11 s |
| Input tokens | 9,675 |
| Output tokens | 172 |
| Input cost | $0.00242 |
| Output cost | $0.00026 |
| Firecrawl credits | 4 |
| Firecrawl cost | $0.04 |
| **Total cost** | **$0.0427** |
| Quality score | 0 / 100 |
| Quality rating | Poor |

### 3.3 Extraction result

- **Demographics:** none
- **Stakeholders (source = `deep_enrichment`):** none

### 3.4 DB state after run

- **Outreach stage:** `enriched`
- **Stakeholders count:** 0

### 3.5 Diagnosis

The real contact page is `contactus.php`, but the pipeline guessed `/contact` and got a 404. The external search did discover the correct pages (`administration.php`, `contactus.php`, `nirf.php`) and Jina successfully scraped them, yet the LLM still synthesized zero qualifying stakeholders/demographics. The regex scan found only one generic email. The NIRF/administration pages probably contain the required data in tables or non-English formatting that the current prompt/context pipeline is not extracting. A stronger table-parsing pre-processor or a more specific prompt for Anna University’s legacy PHP pages would likely improve yield.

---

## Aggregate numbers

| Metric | Total |
|---|---:|
| Total latency | 142.62 s |
| Total estimated cost | $0.13103 |
| Total stakeholders extracted | 9 |
| Universities with data | 1 / 3 |

---

## Raw commands for reproducibility

```bash
# Debug trace (read-only, per university)
npx convex run --deployment prod 'actions/deepEnrichment:debugDeepEnrichment' '{"universityId":"kn7akh0c20580226wnh8v63gyx86fnj2"}'
npx convex run --deployment prod 'actions/deepEnrichment:debugDeepEnrichment' '{"universityId":"kn7d4ac08nz6b51zzbcx8gb42x86eytp"}'
npx convex run --deployment prod 'actions/deepEnrichment:debugDeepEnrichment' '{"universityId":"kn74npsv28sqb9cynv7ae0jafx86fvfe"}'

# Live deep enrichment (writes to DB)
npx convex run --deployment prod 'actions/liveTest:runLiveDeepEnrichmentTest' '{"universities":[{"name":"National Institute of Technology Delhi","website":"https://nitdelhi.ac.in/","state":"Delhi","city":"New Delhi","type":"Other"},{"name":"Visvesvaraya National Institute of Technology, Nagpur","website":"https://vnit.ac.in/","state":"Maharashtra","city":"Nagpur","type":"Other"},{"name":"Anna University","website":"http://www.annauniv.edu","state":"Tamil Nadu","city":"Chennai","type":"State"}]}'
```
