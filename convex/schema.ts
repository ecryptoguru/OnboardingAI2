import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  // ─── Universities ─────────────────────────────────────────────────────────
  universities: defineTable({
    university_name: v.string(),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    website: v.optional(v.string()),
    website_status: v.union(
      v.literal("pending"),
      v.literal("valid"),
      v.literal("invalid"),
      v.literal("discovered"),
      v.literal("discovered_weak"),
    ),
    lead_tier: v.optional(
      v.union(v.literal("High"), v.literal("Medium"), v.literal("Low")),
    ),
    outreach_stage: v.optional(
      v.union(
        v.literal("new"),
        v.literal("enriching"),
        v.literal("enriched"),
        v.literal("sequencing"),
        v.literal("outreach_active"),
        v.literal("replied"),
        v.literal("meeting_booked"),
        v.literal("proposal_sent"),
        v.literal("closed"),
        v.literal("not_interested"),
        v.literal("skipped"),
      ),
    ),
    address: v.optional(v.string()),
    zip_code: v.optional(v.string()),
    ugc_status: v.optional(v.string()), // e.g. "2(f) & 12(B)"
    vc_name: v.optional(v.string()),
    registrar_name: v.optional(v.string()),
    student_count: v.optional(v.number()),
    type: v.optional(v.string()), // "Private" | "Public" | "Deemed" | "Central" | "State" | "INI" | "Other"
    category: v.optional(v.string()), // "IIT" | "NIT" | "IIIT"
    data_source: v.optional(v.string()), // "ugc" | "curated" | "csv" | "manual"
    naac_grade: v.optional(v.string()),
    established_year: v.optional(v.number()),
    notes: v.optional(v.string()),
    // Enrichment job progress for long-running deep-enrichment runs
    enrichment_status: v.optional(
      v.union(
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("timed_out"),
      ),
    ),
    enrichment_phase: v.optional(v.string()),
    enrichment_started_at: v.optional(v.number()),
    enrichment_completed_at: v.optional(v.number()),
    enrichment_error: v.optional(v.string()),
    demographics: v.optional(
      v.object({
        // ── AISHE / NAAC SSR block (hostelite breakdown) ──────────────────────
        total_students: v.optional(v.number()),
        total_students_male: v.optional(v.number()),
        total_students_female: v.optional(v.number()),
        total_students_source: v.optional(v.string()),
        day_scholars: v.optional(v.number()),
        day_scholars_male: v.optional(v.number()),
        day_scholars_female: v.optional(v.number()),
        hostelites: v.optional(v.number()),
        hostelites_male: v.optional(v.number()),
        hostelites_female: v.optional(v.number()),
        source: v.optional(v.string()), // e.g., "AISHE 2022-23 AND NAAC SSR 2023"
        source_urls: v.optional(v.array(v.string())),
        // ── Data quality tracking ────────────────────────────────────────────
        data_quality: v.optional(
          v.union(
            v.literal("verified"),   // From official government source
            v.literal("partial"),      // Some fields from gov, some inferred
            v.literal("inferred"),     // No government source found
          ),
        ),
        // ── NIRF program-wise block ───────────────────────────────────────────
        nirf_source: v.optional(v.string()), // e.g., "NIRF 2023-24"
        nirf_total: v.optional(v.number()), // sum across all programs
        nirf_male: v.optional(v.number()),
        nirf_female: v.optional(v.number()),
        nirf_programs: v.optional(
          v.array(
            v.object({
              name: v.string(), // "UG (4 Years)", "PG (2 Years)", "PhD"
              male: v.optional(v.number()),
              female: v.optional(v.number()),
              total: v.optional(v.number()),
            }),
          ),
        ),
      }),
    ),
    created_at: v.number(), // Unix ms
    updated_at: v.number(),
  })
    .index("by_website_status", ["website_status"])
    .index("by_lead_tier", ["lead_tier"])
    .index("by_outreach_stage", ["outreach_stage"])
    .index("by_created_at", ["created_at"])
    .index("by_type", ["type"])
    .index("by_category", ["category"])
    .index("by_data_source", ["data_source"])
    .index("by_type_status", ["type", "website_status"])
    .index("by_type_stage", ["type", "outreach_stage"])
    .index("by_status_stage", ["website_status", "outreach_stage"])
    .searchIndex("search_name", { searchField: "university_name" }),

  // ─── Stakeholders ─────────────────────────────────────────────────────────
  stakeholders: defineTable({
    university_id: v.id("universities"),
    name: v.optional(v.string()),
    role: v.optional(v.string()), // "Vice Chancellor", "Registrar", etc.
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    linkedin_url: v.optional(v.string()),
    is_primary: v.boolean(),
    source: v.optional(v.string()), // "scraper" | "serper" | "manual"
    source_type: v.optional(v.string()),
    source_url: v.optional(v.string()),
    sources: v.optional(v.array(v.string())),
    last_enriched_source: v.optional(v.string()),
    last_enriched_at: v.optional(v.number()),
    change_log: v.optional(v.array(v.string())),
    // Contact provenance tracking
    email_source: v.optional(
      v.union(
        v.literal("scraped"),    // Found on website via scraper
        v.literal("regex"),      // Extracted via regex from page content
        v.literal("inferred"),   // Guessed from role + domain pattern
        v.literal("linkedin"),   // From LinkedIn enrichment
        v.literal("manual"),     // User-added
      ),
    ),
    phone_source: v.optional(
      v.union(
        v.literal("scraped"),
        v.literal("regex"),
        v.literal("inferred"),
        v.literal("manual"),
        v.literal("none"),
      ),
    ),
    linkedin_source: v.optional(
      v.union(
        v.literal("scraped"),    // Explicitly present in source page
        v.literal("inferred"),   // Guessed from name search
        v.literal("manual"),     // User-added
        v.literal("none"),       // No LinkedIn data
      ),
    ),
    contact_confidence: v.optional(v.number()), // 0-1, overall confidence for this record's contact details
    created_at: v.number(),
    updated_at: v.optional(v.number()),
  })
    .index("by_university", ["university_id"])
    .index("by_email", ["email"])
    .index("by_university_email", ["university_id", "email"])
    .index("by_university_primary", ["university_id", "is_primary"]),

  // ─── Priority Scores ──────────────────────────────────────────────────────
  priorityScores: defineTable({
    university_id: v.id("universities"),
    deterministic_score: v.number(), // 0-100
    ai_score: v.optional(v.number()), // 0-10 from Gemini
    final_score: v.number(), // weighted composite
    scoring_factors: v.object({
      // New Fretbox-specific scoring factors (optional for backward compat with old records)
      hostelite_score: v.optional(v.number()),
      student_scale_score: v.optional(v.number()),
      naac_score: v.optional(v.number()),
      agility_score: v.optional(v.number()),
      stakeholder_score: v.optional(v.number()),
      digital_signals_score: v.optional(v.number()),
      hostelites_inferred: v.optional(v.boolean()),
      // Legacy fields (some old records may have these; keep as optional so they don't fail validation)
      student_count_score: v.optional(v.number()),
      digital_presence_score: v.optional(v.number()),
      news_activity_score: v.optional(v.number()),
      location_score: v.optional(v.number()),
    }),
    scored_at: v.number(),
  }).index("by_university", ["university_id"]),

  // ─── University Signals (with vector embeddings for RAG) ──────────────────
  universitySignals: defineTable({
    university_id: v.id("universities"),
    signal_type: v.union(
      v.literal("news"),
      v.literal("linkedin"),
      v.literal("website"),
      v.literal("manual"),
      v.literal("image"),
    ),
    content: v.string(),
    source_url: v.optional(v.string()),
    embedding: v.array(v.float64()), // 768-dim from gemini-embedding-001
    created_at: v.number(),
  })
    .index("by_university", ["university_id"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["university_id"],
    }),

  // ─── Outreach Sequences ───────────────────────────────────────────────────
  outreachSequences: defineTable({
    university_id: v.id("universities"),
    stakeholder_id: v.id("stakeholders"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("pending_approval"),
      v.literal("completed"),
      v.literal("opted_out"),
    ),
    current_step: v.number(), // 1-based step index
    total_steps: v.number(),
    next_send_at: v.optional(v.number()), // Unix ms
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_university", ["university_id"])
    .index("by_university_status", ["university_id", "status"])
    .index("by_university_stakeholder", ["university_id", "stakeholder_id"])
    .index("by_status_next_send", ["status", "next_send_at"]),

  // ─── Emails Sent ──────────────────────────────────────────────────────────
  emailsSent: defineTable({
    sequence_id: v.optional(v.id("outreachSequences")),
    university_id: v.id("universities"),
    stakeholder_id: v.optional(v.id("stakeholders")),
    recipient_email: v.optional(v.string()),
    step_number: v.number(),
    subject: v.string(),
    body: v.string(),
    html_body: v.optional(v.string()), // HTML version of body for rich email clients
    document_storage_id: v.optional(v.id("_storage")),
    attachments: v.optional(
      v.array(
        v.object({
          storage_id: v.id("_storage"),
          filename: v.string(),
          mime_type: v.string(),
        }),
      ),
    ),
    sendgrid_message_id: v.optional(v.string()),
    zeptomail_message_id: v.optional(v.string()),
    owner_id: v.optional(v.id("users")), // user who created/owns this draft
    status: v.union(
      v.literal("pending_approval"),
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    drafted_at: v.optional(v.number()), // when the draft was created
    sent_at: v.optional(v.number()),    // when it was actually dispatched
    opened_at: v.optional(v.number()),
  })
    .index("by_sequence", ["sequence_id"])
    .index("by_university", ["university_id"])
    .index("by_stakeholder", ["stakeholder_id"])
    .index("by_status", ["status"])
    .index("by_step_number", ["step_number"])
    .index("by_sendgrid_id", ["sendgrid_message_id"])
    .index("by_zeptomail_id", ["zeptomail_message_id"])
    .index("by_owner_status", ["owner_id", "status"]),

  // ─── Reply Logs ───────────────────────────────────────────────────────────
  replyLogs: defineTable({
    university_id: v.id("universities"),
    stakeholder_id: v.id("stakeholders"),
    email_id: v.optional(v.id("emailsSent")),
    raw_reply: v.string(),
    classification: v.optional(
      v.union(
        v.literal("meeting_request"),
        v.literal("positive_interest"),
        v.literal("request_info"),
        v.literal("not_interested"),
        v.literal("opt_out"),
        v.literal("out_of_office"),
        v.literal("other"),
      ),
    ),
    confidence: v.optional(v.number()), // 0-1
    classified_at: v.optional(v.number()),
    received_at: v.number(),
  })
    .index("by_university", ["university_id"])
    .index("by_classification", ["classification"]),

  // ─── Proposals ────────────────────────────────────────────────────────────
  proposals: defineTable({
    university_id: v.id("universities"),
    stakeholder_id: v.optional(v.id("stakeholders")),
    meeting_date: v.optional(v.number()),
    agenda: v.optional(v.string()),
    proposal_json: v.optional(v.string()), // JSON string of structured proposal
    recommended_modules: v.optional(v.array(v.string())),
    pdf_storage_id: v.optional(v.id("_storage")),
    status: v.union(v.literal("draft"), v.literal("ready"), v.literal("sent"), v.literal("meeting_confirmed"), v.literal("cancelled")),
    // Google Calendar / Meet integration
    calendar_event_id: v.optional(v.string()),
    meet_link: v.optional(v.string()),
    calendar_event_status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("cancelled"),
      ),
    ),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_university", ["university_id"]).index("by_created_at", ["created_at"]),

  // ─── Rate Limits ──────────────────────────────────────────────────────────
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  }).index("by_key", ["key"]),

  // ─── LLM Daily Budget ─────────────────────────────────────────────────────
  llmBudget: defineTable({
    dateKey: v.string(), // "2026-06-11"
    totalCostUsd: v.number(),
    totalTokens: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["dateKey"]),

  // ─── LLM Response Cache (deterministic tasks only) ──────────────────────────
  llmCache: defineTable({
    promptHash: v.string(),
    model: v.string(),
    temperature: v.number(),
    response: v.string(),
    expiresAt: v.number(),
  }).index("by_hash_model_temp", ["promptHash", "model", "temperature"]),

  // ─── Settings ─────────────────────────────────────────────────────────────
  systemSettings: defineTable({
    configKey: v.string(), // e.g. "geminiApiKey"
    value: v.string(),
  }).index("by_key", ["configKey"]),
});
