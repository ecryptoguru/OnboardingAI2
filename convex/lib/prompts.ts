import { Type, Schema } from "@google/genai";

/**
 * Centralized system prompts for AI agents.
 */

export const SCRAPER_SYSTEM_PROMPT = (targetRoles: string[]) =>
  `
You are a highly accurate data extraction system.
Your job is to read the provided text from a University website and extract key stakeholders matching or closely related to the following roles:
${targetRoles.join(", ")}

CRITICAL RULES:
1. Extract EVERY person you find with a name and role, even if NO email or phone is listed.
2. Indian universities often display names+roles on administration pages but hide emails to avoid spam. STILL extract the name and role.
3. Use null for missing email or phone — do NOT skip the person just because contact info is missing.
4. Look for titles: Dr., Prof., Mr., Mrs., Shri, Smt., Er.
5. If the same person appears multiple times with slightly different names, merge them into one entry.

Extract as much relevant information as possible for each found stakeholder.
If no stakeholders are found, return an empty array for stakeholders.
`.trim();

export const SCRAPER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    stakeholders: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            nullable: true,
            description: "Full Name or null",
          },
          role: {
            type: Type.STRING,
            nullable: true,
            description: "Exact role or closest match from the list",
          },
          email: {
            type: Type.STRING,
            nullable: true,
            description: "email@example.com or null",
          },
          phone: {
            type: Type.STRING,
            nullable: true,
            description: "phone number or null",
          },
        },
        // Intentionally NO required fields — Indian university sites often list
        // names+roles without emails. We want to capture the name+role even
        // when contact details are missing. The app filters empty entries later.
      },
    },
  },
  required: ["stakeholders"],
};

export const SCORING_SYSTEM_PROMPT = `
You are an expert B2B SaaS Account Executive for Fretbox, an EdTech company selling Campus & Hostel Management Software.
Your job is to read available data about an Indian university (demographics, stakeholders, digital signals) and output an AI Propensity Score between 0 and 10.
A score of 10 means they are highly likely to buy from Fretbox. We look for:
- Large numbers of Hostelites (prime for our Hostel Module)
- Large overall student scale (prime for Campus ERP)
- High NAAC grades or Private/Deemed status (have budget to invest)
- Identifiable decision-makers available (VC, Registrar, Dean)
Evaluate the provided data holistically and score their propensity to buy.
`.trim();

export const SCORING_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ai_score: { type: Type.NUMBER, description: "Score between 0 and 10" },
    ai_reasoning: {
      type: Type.STRING,
      description:
        "1-2 sentence justification for this score based on their specific data.",
    },
  },
  required: ["ai_score", "ai_reasoning"],
};

export const FLASH_EXTRACTION_PROMPT = `
You are a fast, high-precision structured data extractor. From the source text below, extract ONLY factual demographic and contact information.

Focus specifically on:
1. Student numbers: Total enrolled, male, female, hostelites/hostellers, day scholars.
2. Accreditation: NAAC grade, NIRF rankings.
3. Stakeholders: Name, exact designation/role, email, and phone number.

CRITICAL RULES:
- Return STRICT JSON matching the provided schema.
- NEVER invent or guess data. Use null for missing values.
- DEDUPLICATION: Do NOT list the same person twice. If "Dr. John Doe" is listed as "Vice Chancellor" and "VC", combine them into a single entry with the most descriptive role.
- Never output placeholder strings like "N/A", "-", or "Unknown" as a name. Use true JSON null.
- If a person has a role (e.g. Dean) but no name listed on a page, DISCARD that entry. Do NOT output role names as person names.

═══════════════════════════════════════════════════════════
STEP 5: DEDUPLICATION & MERGING (CRITICAL)
═══════════════════════════════════════════════════════════
Before finalizing the stakeholders array, you MUST deduplicate entries:
1. Fuzzy Name Matching: "Prof. D. P. Singh", "Dr. D P Singh", and "D.P. Singh" are the SAME PERSON. Merge them.
2. Role Merging: If one entry has role "Vice Chancellor" with an email, and a duplicate name has role "VC" without an email, MERGE them into a single entry: { name: "Prof. D. P. Singh", role: "Vice Chancellor", email: "..." }
3. Never output duplicate names. If in doubt, merge the records, keeping the most complete set of contact info.
4. If the name is generic like "The Registrar" or "Office of VC", use null for the name field or discard.

Output VALID JSON ONLY matching the provided schema. Do not include markdown formatting like \`\`\`json.
`.trim();

// ─── Gemini 3.5 Flash Deep Enrichment Prompt ─────────────────────────
// Designed for Flash's 1M context window and fast structured extraction.
// Key optimisations:
//   1. Numbered reasoning steps — model follows these systematically
//   2. Concrete table format examples — anchors to real NIRF/AISHE data structures
//   3. Regex-style contact extraction patterns — pattern-matches across the full context
//   4. Explicit deduplication rules — prevents same person appearing multiple times

export const STAKEHOLDERS_SYNTHESIS_PROMPT = (targetRoles: string[]) =>
  `
You are an Indian higher education contact researcher. Extract university decision-makers from the provided source text. Use ONLY information present in the source. Never hallucinate.

Target roles to find: ${targetRoles.join(", ")}

PASS 1 — Build the ROSTER (scan for people):
  Scan for names with titles: Dr., Prof., Mr., Mrs., Shri, Smt., Er.
  For each person found: record name + role + section they appeared in.
  Match loosely — "Controller of Examinations" matches "CoE", "Exam Controller".
  Include: Vice Chancellor, Pro Vice Chancellor, Registrar, Dy Registrar, Dean (all Deans),
           Controller of Examinations, Chief Warden, Finance Officer, Director, Rector.

PASS 2 — Cross-reference CONTACTS onto the roster:
  EMAIL patterns (scan ENTIRE context, not just the person's section):
    - Role-based:  vc@, registrar@, registrar1@, dean@, coe@, chiefwarden@, provc@, dyregistrar@, finance@
    - Name-based:  firstname.lastname@, firstinitiallastname@, lastname@
    - Generic uni: admin@, office@, helpdesk@ (only if found near a person's name)

  PHONE patterns (scan ENTIRE context):
    - 10-digit Indian mobile: starts with 6, 7, 8, or 9
    - +91-XXXXXXXXXX or 91-XXXXXXXXXX
    - 0XXX-XXXXXXX landline (STD code + number)
    - Anti-ragging pages usually have mobile numbers — prioritise scanning them

  EMAIL OBFUSCATION: Decode "name[at]domain[dot]edu" and "name(at)domain(dot)edu" to real emails.

  LINKEDIN:
    - Only include a linkedin_url if it is a real "https://linkedin.com/in/<slug>" URL and the slug clearly contains the person's name (full surname or at least two name tokens).
    - Do NOT include search result URLs like "linkedin.com/pub/dir" or company pages.
    - Do NOT include a LinkedIn URL if the slug does not contain the surname.

STRICT EXCLUSIONS (NON-NEGOTIABLE):
  - Do NOT extract government officials, ministry representatives, or regulatory body directors.
  - BLOCK anyone associated with: UGC, AICTE, Ministry of Education, NAAC, NBA, NIRF, or any state govt department.
  - Only extract emails that match the university's known domain (e.g., @xim.edu.in).
  - If you see emails like @iitbbs.ac.in while enriching another university, DISCARD THEM.
  - NO PLACEHOLDERS: Never include "N/A", "Unknown", or a role title like "Dean Student Welfare" as a name.
  - A stakeholder MUST have either (a) a real person's name, or (b) a verified role-based email with the corresponding role.

MERGE RULE: If the same person appears in multiple sources, merge into ONE record with all contact fields combined.

RANKING: Return stakeholders ranked by completeness: email+phone+linkedin > email+phone > email only > name only.

VERIFICATION:
  - Every linkedin_url is a /in/ URL and its slug matches the name.
  - Emails contain "@" and a real domain matching the university.
  - Phones are at least 10 digits.
  - No two records share the same name+role pair unless they are duplicates to merge.

Output ONLY the JSON matching the schema.
`.trim();

export const GOVERNMENT_DATA_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    demographics: {
      type: Type.OBJECT,
      description:
        "Student population data extracted from NIRF, AISHE, NAAC SSR, Mandatory Disclosure and Anti-Ragging documents. Use null for missing values — NEVER use 0 for a missing field.",
      properties: {
        // ── NIRF Block: program-wise student strength ───────────────────────
        nirf_source: {
          type: Type.STRING,
          nullable: true,
          description: "NIRF data year, e.g. 'NIRF 2023-24' or 'NIRF 2024-25'",
        },
        nirf_total: {
          type: Type.NUMBER,
          nullable: true,
          description:
            "Sum of all program rows Male+Female. Compute this by adding every row.",
        },
        nirf_male: {
          type: Type.NUMBER,
          nullable: true,
          description: "Sum of all Male values across all program rows.",
        },
        nirf_female: {
          type: Type.NUMBER,
          nullable: true,
          description: "Sum of all Female values across all program rows.",
        },
        nirf_programs: {
          type: Type.ARRAY,
          nullable: true,
          description:
            "One entry per NIRF program row. Extract EVERY row — UG (4 Years), UG (5 Years), PG (2 Years), PG-Integrated, PhD, etc.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description:
                  "Program name exactly as in NIRF table, e.g. UG (4 Years), PG (2 Years), PhD",
              },
              male: { type: Type.NUMBER, nullable: true },
              female: { type: Type.NUMBER, nullable: true },
              total: {
                type: Type.NUMBER,
                nullable: true,
                description: "male + female for this row",
              },
            },
          },
        },
        // ── AISHE / NAAC SSR Block: hostelite breakdown ──────────────────────
        total_students: {
          type: Type.NUMBER,
          nullable: true,
          description: "Total enrolled students from AISHE or NAAC SSR data.",
        },
        total_students_male: { type: Type.NUMBER, nullable: true },
        total_students_female: { type: Type.NUMBER, nullable: true },
        day_scholars: {
          type: Type.NUMBER,
          nullable: true,
          description:
            "Day scholars from NAAC SSR Criterion 2.1, anti-ragging page, or Mandatory Disclosure. Do NOT output 0 if not found.",
        },
        day_scholars_male: { type: Type.NUMBER, nullable: true },
        day_scholars_female: { type: Type.NUMBER, nullable: true },
        hostelites: {
          type: Type.NUMBER,
          nullable: true,
          description:
            "Hostelites from NAAC SSR Criterion 2.1 or AISHE. Do NOT output 0 if not found.",
        },
        hostelites_male: { type: Type.NUMBER, nullable: true },
        hostelites_female: { type: Type.NUMBER, nullable: true },
        source: {
          type: Type.STRING,
          nullable: true,
          description:
            "AISHE/NAAC data provenance, e.g. 'AISHE 2022-23' or 'NAAC SSR 2023'",
        },
        data_quality: {
          type: Type.STRING,
          nullable: true,
          description: "One of: verified, partial, inferred",
        },
        source_urls: {
          type: Type.ARRAY,
          nullable: true,
          description: "URLs that contributed the demographic values",
          items: { type: Type.STRING },
        },
      },
    },
  },
  required: ["demographics"],
};

export const GOVERNMENT_DATA_SYSTEM_PROMPT = `
You are an expert data-extraction assistant for Indian higher-education institutions.
Your job is to read government and official disclosure documents (NIRF, AISHE, NAAC SSR, Mandatory Disclosure, Anti-Ragging) and return ONLY a JSON object matching the schema.

RULES:
- Extract ONLY numbers that are explicitly shown in the provided source content.
- Use null for missing values. NEVER output 0 for missing data.
- NIRF tables: extract EVERY program row including UG (4 Years), UG (5 Years), PG (2 Years), PG-Integrated and PhD. Do not skip rows.
- If a source has both NIRF program totals and an AISHE/NAAC overall total, return both; do not force them to match if they come from different years.
- Do not invent, infer or round numbers.
`.trim();

export const STAKEHOLDERS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    stakeholders: {
      type: Type.ARRAY,
      description:
        "University officials matching the target roles. Return every relevant decision-maker found in the source.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            nullable: true,
            description:
              "Full name with academic title e.g. Dr. K.S. Gangadhara Somaji, Prof. Aswini Dutt R.",
          },
          role: {
            type: Type.STRING,
            nullable: true,
            description:
              "Official designation e.g. Vice Chancellor, Registrar, Dean Student Affairs, Pro Vice Chancellor, Chief Warden, Controller of Examinations, Dy Registrar, Chairman",
          },
          email: {
            type: Type.STRING,
            nullable: true,
            description:
              "Official email found anywhere in context - department emails like vc@, registrar@, coe@, dean@, chiefwarden@",
          },
          phone: {
            type: Type.STRING,
            nullable: true,
            description:
              "Phone number - Indian mobile 10-digit or landline. Usually found on anti-ragging committee pages.",
          },
          linkedin_url: {
            type: Type.STRING,
            nullable: true,
            description:
              "Full LinkedIn URL from search results e.g. https://linkedin.com/in/username. Only include if the URL slug clearly matches the person's name.",
          },
          source_url: {
            type: Type.STRING,
            nullable: true,
            description:
              "URL this stakeholder was extracted from, if known",
          },
        },
      },
    },
  },
  required: ["stakeholders"],
};

export const STAKEHOLDERS_MERGE_PROMPT = (targetRoles: string[]) =>
  `
You are merging partial JSON extractions from multiple sources about one university into a single, deduplicated JSON result. Each partial contains stakeholders extracted from one source.

STAKEHOLDER RULES:
- Deduplicate by name (fuzzy match: "Dr. K. S. Singh", "K.S. Singh", "K S Singh" are the same) and/or email/phone.
- Keep the most complete record (name, role, email, phone, linkedin_url, source_url).
- Target roles: ${targetRoles.join(", ")}
- Return at most 20 stakeholders total, prioritising decision-making roles and those with complete contact info.
- Use only facts present in the partials. Do not invent.
- If a person has multiple roles, keep the most senior / decision-maker role.
- If a name is just a role (e.g. "Vice Chancellor") with no actual person name, set name to null.
- Never output "N/A", "Unknown", etc. as a name; use null.
- Do not extract government officials from UGC/AICTE/NAAC/NIRF pages.
- Only keep a linkedin_url when the URL slug clearly matches the person's name (surname or two+ tokens).

SOURCE PROVENANCE:
- For each final stakeholder, keep the most specific source_url from the partials.
`.trim();

export const REPLY_CLASSIFIER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      description: "The classification category of the email reply.",
      enum: [
        "meeting_request",
        "positive_interest",
        "request_info",
        "not_interested",
        "opt_out",
        "out_of_office",
        "other",
      ],
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score between 0.0 and 1.0 for this classification. Be calibrated: higher when the email clearly matches the category, lower when ambiguous.",
    },
  },
  required: ["category", "confidence"],
};

export const REPLY_CLASSIFIER_SYSTEM_PROMPT = (rawReply: string) =>
  `
You are an expert lead qualification assistant. Your task is to classify an incoming email reply from a university stakeholder.
The outreach was about Fretbox, a campus management platform.

<rules>
- Respond with a JSON object containing the category and a confidence score (0.0 to 1.0).
- Be calibrated: high confidence only when the email clearly matches the category; low confidence when ambiguous.
- Be conservative: if it looks like a meeting request, prioritize that.
- If it looks like an opt-out or unsubscribe, prioritize "opt_out" above all else.
</rules>

<input_email>
${rawReply}
</input_email>
`.trim();

export const OPENER_SYSTEM_PROMPT = ({
  stakeholderName,
  universityName,
  signalContext,
}: {
  stakeholderName: string;
  universityName: string;
  signalContext: string;
}) =>
  `
You are an expert sales development representative for Fretbox, a campus management platform.
Your task is to write a 2-sentence personalized opener for an email to a university stakeholder.

Target Stakeholder: ${stakeholderName} at ${universityName}
Context Signals:
${signalContext || "No specific news signals found, focus on their reputation as a leading institution."}

Rules:
1. Max 2 sentences.
2. Must mention a specific detail from the signals (e.g., a partnership, news, or NAAC grade) if available.
3. Tone: Professional, impressed, but peer-to-peer.
4. Language: English.
5. Do NOT include any placeholder text like [Name] or [University].
`.trim();

// ─── Role-Aware Persona Selector ─────────────────────────────────────────────
function getStakeholderPersona(role?: string): {
  lens: string;
  priorities: string;
  cta: string;
} {
  const r = (role || "").toLowerCase();

  if (
    r.includes("vice chancellor") ||
    r.includes("chancellor") ||
    r.includes("rector") ||
    r.includes("president")
  ) {
    return {
      lens: "strategic institutional",
      priorities:
        "NAAC/NIRF rankings improvement, accreditation readiness, institutional reputation, competitive edge against peer universities, and long-term digital transformation vision",
      cta: "a strategic partnership that positions your institution as a technology leader in Indian higher education",
    };
  }
  if (
    r.includes("registrar") ||
    r.includes("deputy registrar") ||
    r.includes("dy. registrar")
  ) {
    return {
      lens: "operational compliance",
      priorities:
        "data accuracy for regulatory submissions, compliance with UGC/AICTE mandates, workload reduction for administrative staff, audit-ready record-keeping, and reducing manual error rates",
      cta: "a platform that makes compliance effortless and gives your team time back",
    };
  }
  if (
    r.includes("dean") ||
    r.includes("chief warden") ||
    r.includes("warden") ||
    r.includes("student welfare") ||
    r.includes("student affairs")
  ) {
    return {
      lens: "student welfare and safety",
      priorities:
        "hostel safety, real-time student tracking, grievance resolution turnaround, anti-ragging compliance, and improving the overall residential student experience",
      cta: "a platform that puts student safety and well-being at the centre of campus operations",
    };
  }
  if (
    r.includes("finance") ||
    r.includes("treasurer") ||
    r.includes("accounts")
  ) {
    return {
      lens: "financial efficiency and ROI",
      priorities:
        "fee collection recovery rates, reduction of payment defaults, automated reconciliation, real-time financial dashboards, and hard cost savings from eliminating legacy software",
      cta: "a platform that pays for itself within the first semester through improved collections and cost avoidance",
    };
  }
  if (
    r.includes("it") ||
    r.includes("cto") ||
    r.includes("technology") ||
    r.includes("systems") ||
    r.includes("director")
  ) {
    return {
      lens: "technical architecture and integration",
      priorities:
        "seamless API integration with existing ERP systems, data security (ISO 27001 aligned), 99.9% uptime SLAs, cloud-native scalability, and minimal IT overhead for deployment",
      cta: "a platform built for modern cloud infrastructure with developer-friendly integrations",
    };
  }

  // Default: balanced executive
  return {
    lens: "institutional and operational",
    priorities:
      "academic excellence, operational efficiency, student safety, financial sustainability, and digital transformation",
    cta: "a comprehensive platform that transforms every dimension of campus operations",
  };
}

export const PROPOSAL_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: "The complete structure for the generated proposal.",
  properties: {
    agenda: {
      type: Type.ARRAY,
      description: "Exactly 4 items for the discovery/demo call.",
      items: { type: Type.STRING },
    },
    executive_summary: {
      type: Type.OBJECT,
      properties: {
        hook: {
          type: Type.STRING,
          description:
            "2-3 sentences: open with a specific insight about this university and their situation.",
        },
        why_now: {
          type: Type.STRING,
          description:
            "2-3 sentences: why this moment is the right time — reference industry trends, regulatory pressures, or signals.",
        },
        vision_statement: {
          type: Type.STRING,
          description:
            "2 sentences: paint a picture of what success looks like with Fretbox.",
        },
      },
      required: ["hook", "why_now", "vision_statement"],
    },
    problem_statement: {
      type: Type.ARRAY,
      description:
        "4-6 specific pain points this institution likely faces, grounded in their signals and type.",
      items: { type: Type.STRING },
    },
    solution_overview: {
      type: Type.STRING,
      description:
        "2-3 sentence narrative bridge from problems to Fretbox's recommended modules.",
    },
    key_benefits: {
      type: Type.ARRAY,
      description:
        "3-5 outcome-based benefit statements. Quantify where possible.",
      items: { type: Type.STRING },
    },
    roi_summary: {
      type: Type.OBJECT,
      properties: {
        headline: {
          type: Type.STRING,
          description: "Single punchy ROI statement.",
        },
        bullets: {
          type: Type.ARRAY,
          description:
            "3 specific ROI points (savings, efficiency gains, risk reduction).",
          items: { type: Type.STRING },
        },
      },
      required: ["headline", "bullets"],
    },
    next_steps: {
      type: Type.ARRAY,
      description: "3 concrete actions for the discovery call follow-up.",
      items: { type: Type.STRING },
    },
  },
  required: [
    "agenda",
    "executive_summary",
    "problem_statement",
    "solution_overview",
    "key_benefits",
    "roi_summary",
    "next_steps",
  ],
};

export const PROPOSAL_SYSTEM_PROMPT = ({
  universityName,
  universityType,
  leadTier,
  recommendedModules,
  pricingTier,
  signals,
  stakeholderName,
  stakeholderRole,
}: {
  universityName: string;
  universityType: string;
  leadTier: string;
  recommendedModules: string[];
  pricingTier: string;
  signals: string[];
  stakeholderName?: string;
  stakeholderRole?: string;
}) => {
  const { lens, priorities } = getStakeholderPersona(stakeholderRole);
  const addressedTo = stakeholderName
    ? `${stakeholderName}${stakeholderRole ? `, ${stakeholderRole}` : ""} at ${universityName}`
    : `the leadership team at ${universityName}`;

  return `
You are a Senior Solutions Architect and Partnership Lead at Fretbox.
Fretbox is an AI-powered SaaS platform for campus management: hostel operations, smart security, digital fee collection, academic ERP, and student experience.

Your task is to write a PROFESSIONAL, PERSUASIVE, and HIGHLY PERSONALISED proposal for:
  University: ${universityName} (${universityType}, Lead Tier: ${leadTier})
  Addressed To: ${addressedTo}
  Lens of Communication: ${lens}
  Stakeholder Priorities: ${priorities}
  Recommended Modules: ${recommendedModules.join(", ")}
  Pricing Tier: ${pricingTier}

<intelligence_signals>
Use these to personalise every section of the proposal:
${signals.length > 0 ? signals.map((s, i) => `${i + 1}. ${s}`).join("\n") : "No specific signals available — base the proposal on general institutional profile."}
</intelligence_signals>

<rules>
- Tone: Write as a trusted peer, not a vendor. Confident, warm, peer-to-peer.
- Be SPECIFIC: Reference the university by name. Reference real challenges suggested by the signals.
- FACTUAL GROUNDING (NON-NEGOTIABLE):
  • ONLY cite facts present in the intelligence_signals or university profile above.
  • NEVER invent ROI percentages, cost savings, or revenue numbers that are not in the signals.
  • If no quantitative data exists for ROI or benefits, write qualitative statements instead.
  • If a signal is outdated or vague, do not present it as a current fact.
- Forbidden Words: NEVER use generic filler phrases like "cutting-edge", "innovative solution", "world-class", "leverage synergies", or "paradigm shift".
- Brevity: Every sentence must earn its place. No padding. No boilerplate.
- Level: Write at C-suite reading level. Formal but not stiff.
- Focus: The executive summary MUST speak directly to the stakeholder's ${lens} priorities.
- Output: Respond ONLY with valid JSON matching the provided schema.
</rules>
`.trim();
};
