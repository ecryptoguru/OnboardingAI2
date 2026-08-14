import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { validateAuth } from "./lib/auth_utils";
import {
  canonicalizeInstitutionEmail,
  choosePreferredRoleEmail,
  isRelevantInstitutionEmailDomain,
  isRoleBasedInstitutionEmail,
  isSingletonRole,
  namesEquivalent,
  normalizeInstitutionDomain,
  normalizeStakeholderRole,
} from "./lib/contactInference";
import { normalizeIndianPhone } from "./lib/phone";
import {
  isLikelyValidLinkedIn,
  linkedinMatchesName,
} from "./lib/validateDeepEnrichment";

// Source type aliases matching the schema union types
type EmailSource = "scraped" | "regex" | "inferred" | "linkedin" | "manual";
type PhoneSource = "scraped" | "regex" | "inferred" | "manual";
type LinkedInSource = "scraped" | "inferred" | "manual" | "none";

// Extract the last token as surname for looser matching
function surnameOf(n?: string): string {
  const tokens = (n || "")
    .toLowerCase()
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return tokens[tokens.length - 1] || "";
}

function stakeholderSignalScore(st: {
  name?: string;
  phone?: string;
  linkedin_url?: string;
  email?: string;
}): number {
  return (
    (st.name ? 5 : 0) +
    (st.phone ? 3 : 0) +
    (st.linkedin_url ? 2 : 0) +
    (st.email ? 1 : 0)
  );
}

function sanitizeRole(role?: string): string | undefined {
  return normalizeStakeholderRole(role);
}

function sanitizePhone(phone?: string): string | undefined {
  return phone ? normalizeIndianPhone(phone) ?? undefined : undefined;
}

function sanitizeEmail(
  email: string | undefined,
  institutionDomain?: string,
): string | undefined {
  return canonicalizeInstitutionEmail(email, institutionDomain);
}

export const listByUniversity = query({
  args: {
    university_id: v.id("universities"),
    enriched_after: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const all = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    return all.filter((s) => {
      const isUGC = (s.source ?? "").toLowerCase().includes("ugc");
      const hasEmail = s.email && s.email !== "null";
      const hasPhone = s.phone && s.phone !== "null";

      if (isUGC && !hasEmail && !hasPhone) {
        return false;
      }
      if (args.enriched_after != null) {
        const at = s.last_enriched_at ?? s.updated_at ?? s.created_at ?? 0;
        if (at < args.enriched_after) return false;
      }
      return true;
    });
  },
});

export const listByUniversities = query({
  args: {
    university_ids: v.array(v.id("universities")),
    enriched_after: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const results = await Promise.all(
      args.university_ids.map(async (university_id) => {
        const all = await ctx.db
          .query("stakeholders")
          .withIndex("by_university", (q) => q.eq("university_id", university_id))
          .collect();
        return all.filter((s) => {
          const isUGC = (s.source ?? "").toLowerCase().includes("ugc");
          const hasEmail = s.email && s.email !== "null";
          const hasPhone = s.phone && s.phone !== "null";
          if (isUGC && !hasEmail && !hasPhone) return false;
          if (args.enriched_after != null) {
            const at = s.last_enriched_at ?? s.updated_at ?? s.created_at ?? 0;
            if (at < args.enriched_after) return false;
          }
          return true;
        });
      }),
    );
    return Object.fromEntries(
      args.university_ids.map((id, i) => [id, results[i]]),
    ) as Record<string, (typeof results)[number]>;
  },
});

export const getPrimary = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    // Try indexed primary lookup first
    const primary = await ctx.db
      .query("stakeholders")
      .withIndex("by_university_primary", (q) =>
        q.eq("university_id", args.university_id).eq("is_primary", true),
      )
      .first();

    if (primary) return primary;

    // Fallback: scan university stakeholders and filter UGC ghosts
    let all = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    all = all.filter((s) => {
      const isUGC = (s.source ?? "").toLowerCase().includes("ugc");
      const hasEmail = s.email && s.email !== "null";
      const hasPhone = s.phone && s.phone !== "null";

      if (isUGC && !hasEmail && !hasPhone) {
        return false;
      }
      return true;
    });

    return all[0] ?? null;
  },
});

export const upsertByEmail = mutation({
  args: {
    university_id: v.id("universities"),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    phone: v.optional(v.string()),
    linkedin_url: v.optional(v.string()),
    is_primary: v.optional(v.boolean()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const university = await ctx.db.get(args.university_id);
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    const normalizedEmail =
      sanitizeEmail(args.email, institutionDomain) ?? args.email.toLowerCase().trim();
    const normalizedRole = sanitizeRole(args.role);
    const normalizedPhone = sanitizePhone(args.phone);
    const existing = await ctx.db
      .query("stakeholders")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name ?? existing.name,
        role: normalizedRole ?? existing.role,
        phone: normalizedPhone ?? existing.phone,
        linkedin_url: args.linkedin_url ?? existing.linkedin_url,
      });
      return existing._id;
    }

    return await ctx.db.insert("stakeholders", {
      university_id: args.university_id,
      email: normalizedEmail,
      name: args.name,
      role: normalizedRole,
      phone: normalizedPhone,
      linkedin_url: args.linkedin_url,
      is_primary: args.is_primary ?? false,
      source: args.source ?? "scraper",
      created_at: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    university_id: v.id("universities"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    is_primary: v.boolean(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const university = await ctx.db.get(args.university_id);
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    return await ctx.db.insert("stakeholders", {
      ...args,
      role: sanitizeRole(args.role),
      email: sanitizeEmail(args.email, institutionDomain),
      phone: sanitizePhone(args.phone),
      created_at: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("stakeholders"),
    linkedin_url: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, ...fields } = args;
    const existing = await ctx.db.get(id);
    const university = existing
      ? await ctx.db.get(existing.university_id)
      : null;
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    if (fields.email) {
      fields.email =
        sanitizeEmail(fields.email, institutionDomain) ??
        fields.email.toLowerCase().trim();
    }
    if (fields.role) fields.role = sanitizeRole(fields.role);
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("stakeholders") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.delete(args.id);
  },
});

export const removeInternal = internalMutation({
  args: { id: v.id("stakeholders") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const insertInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const university = await ctx.db.get(args.university_id);
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    return await ctx.db.insert("stakeholders", {
      ...args,
      role: sanitizeRole(args.role),
      email: sanitizeEmail(args.email, institutionDomain),
      phone: sanitizePhone(args.phone),
      is_primary: false,
      created_at: Date.now(),
    });
  },
});

export const bulkInsertInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    stakeholders: v.array(
      v.object({
        name: v.optional(v.string()),
        role: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        email_source: v.optional(v.string()),
        phone_source: v.optional(v.string()),
        source_url: v.optional(v.string()),
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const university = await ctx.db.get(args.university_id);
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    for (const st of args.stakeholders) {
      const source = args.source || "scraper";
      await ctx.db.insert("stakeholders", {
        university_id: args.university_id,
        name: st.name,
        role: sanitizeRole(st.role),
        email: sanitizeEmail(st.email, institutionDomain),
        phone: sanitizePhone(st.phone),
        is_primary: false,
        source,
        email_source: st.email_source as EmailSource | undefined,
        phone_source: st.phone_source as PhoneSource | undefined,
        last_enriched_source: st.source_url,
        last_enriched_at: now,
        sources: [source],
        created_at: now,
      });
    }
  },
});

export const upsertBulkInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    stakeholders: v.array(
      v.object({
        name: v.optional(v.string()),
        role: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        phone_source: v.optional(v.string()),
        linkedin_url: v.optional(v.string()),
        linkedin_source: v.optional(v.string()),
        email_source: v.optional(v.string()),
        source_url: v.optional(v.string()),
        sources: v.optional(v.array(v.string())),
        contact_confidence: v.optional(v.number()),
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get existing stakeholders for this university to avoid duplicates
    const existingStakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    // Get university details for domain matching
    const university = await ctx.db.get(args.university_id);
    const uniDomain = normalizeInstitutionDomain(university?.website);

    for (const st of args.stakeholders) {
      const normalizedRole = sanitizeRole(st.role);
      const normalizedPhone = sanitizePhone(st.phone);
      const sanitizedInputEmail = sanitizeEmail(st.email, uniDomain);
      // 1. Block generic placeholder emails and names
      const emailLower = (sanitizedInputEmail || "").toLowerCase();
      const nameLower = (st.name || "").toLowerCase();
      const roleLower = (normalizedRole || "").toLowerCase();

      // UGC Check (Strictly forbidden as per user rule)
      const isUGC =
        emailLower.includes("ugc.ac.in") ||
        nameLower.includes("ugc") ||
        roleLower.includes("ugc");

      const isPlaceholder =
        isUGC ||
        (sanitizedInputEmail &&
          (emailLower.includes("@example.") ||
            emailLower.includes("test@") ||
            /^(admin|info|contact|noreply|webmaster|support|help|feedback)@/.test(
              emailLower,
            ) ||
            emailLower.includes("placeholder@") ||
            emailLower.includes("dummy@"))) ||
        (st.name &&
          (nameLower.startsWith("test ") ||
            nameLower === "test" ||
            nameLower === "unknown" ||
            nameLower === "n/a" ||
            nameLower === "none" ||
            /^(admin|info|contact|webmaster|administrator|office|department)$/.test(
              nameLower,
            )));

      // Name-Role Collision: If name matches role, it's just a position title, not a person
      const isNameRoleCollision =
        !!st.name &&
        !!normalizedRole &&
        (nameLower === roleLower ||
          nameLower.includes(roleLower) ||
          roleLower.includes(nameLower) ||
          /\boffice\b/.test(nameLower));

      if (isPlaceholder || isNameRoleCollision) {
        console.log(
          `[stakeholders] Skipping invalid/placeholder stakeholder: ${st.name} <${st.email}> (Reason: ${isUGC ? "UGC" : isNameRoleCollision ? "Name=Role" : "Placeholder"})`,
        );
        continue;
      }

      // 2. Domain matching: strictly prevent cross-institution data (e.g. IIT BBS email for XIM)
      let validatedEmail = sanitizedInputEmail;
      if (sanitizedInputEmail && uniDomain) {
        const emailDomain = emailLower.split("@")[1];
        const genericDomains = [
          "gmail.com",
          "yahoo.com",
          "outlook.com",
          "hotmail.com",
          "rediffmail.com",
          "icloud.com",
          "live.com",
          "me.com",
        ];

        // Robust domain check: exact match, subdomain of uniDomain, or a
        // gov.in-family address (e.g. registrar.nmi@gov.in for nmi.gov.in).
        const isMatch =
          genericDomains.includes(emailDomain) ||
          isRelevantInstitutionEmailDomain(sanitizedInputEmail, uniDomain);

        if (!isMatch) {
          console.warn(
            `[stakeholders] Rejecting cross-domain email: ${sanitizedInputEmail} for university domain: ${uniDomain}`,
          );
          validatedEmail = undefined;
        }
      }

      if (!st.name && !validatedEmail) continue;

      const match = existingStakeholders.find((e) => {
        if (
          validatedEmail &&
          e.email &&
          sanitizeEmail(e.email, uniDomain) === validatedEmail
        )
          return true;

        // Exact name match
        if (st.name && e.name && e.name.toLowerCase() === st.name.toLowerCase())
          return true;

        // Fuzzy name match (e.g. "Dr. D. P. Singh" vs "D P Singh",
        // "Sohrab A. Khan" vs "Sohrab Ahmed Khan").
        // When roles differ, only merge if contact evidence links the two
        // records or one side has no contacts — two different people can
        // share a name but not the same email/phone/LinkedIn.
        if (st.name && e.name && namesEquivalent(e.name, st.name)) {
          const roleA = normalizeStakeholderRole(e.role) || "";
          const roleB = normalizeStakeholderRole(normalizedRole) || "";
          if (roleA && roleB && roleA !== roleB) {
            const sharedContact =
              (validatedEmail &&
                e.email &&
                sanitizeEmail(e.email, uniDomain) === validatedEmail) ||
              (normalizedPhone &&
                e.phone &&
                normalizeIndianPhone(e.phone) === normalizedPhone) ||
              (st.linkedin_url &&
                e.linkedin_url &&
                e.linkedin_url === st.linkedin_url);
            const hasAnyContact =
              !!validatedEmail ||
              !!normalizedPhone ||
              !!st.linkedin_url ||
              !!e.email ||
              !!e.phone ||
              !!e.linkedin_url;
            return sharedContact || !hasAnyContact;
          }
          return true;
        }

        // Surname-only fallback: if names share the same last word and one is short
        // (e.g., "Prof. Singh" vs "V.K. Singh") — only match if roles are identical or empty
        if (
          st.name &&
          e.name &&
          surnameOf(st.name) === surnameOf(e.name) &&
          surnameOf(st.name).length > 2
        ) {
          const roleA = normalizeStakeholderRole(e.role) || "";
          const roleB = normalizeStakeholderRole(normalizedRole) || "";
          if (!roleA && !roleB) return true;
          return false;
        }

        // Fallback: If both have a role, and the roles match exactly (e.g., both "Vice Chancellor"),
        // treat it as an update to the SAME stakeholder position rather than duplicating the role.
        if (
          normalizedRole &&
          e.role &&
          sanitizeRole(e.role)?.toLowerCase() === normalizedRole.toLowerCase()
        ) {
          if (isSingletonRole(normalizedRole)) {
            return true;
          }
          const canMergeRoleAliases =
            isRoleBasedInstitutionEmail(validatedEmail, normalizedRole, uniDomain) &&
            isRoleBasedInstitutionEmail(e.email, e.role, uniDomain);
          if (
            validatedEmail &&
            e.email &&
            validatedEmail !== sanitizeEmail(e.email, uniDomain) &&
            !canMergeRoleAliases
          ) {
            return false;
          }
          return true;
        }

        return false;
      });

      if (match) {
        // Prefer NEW enrichment data over old — this fills in missing emails/phones from re-enrichment
        // Preserve existing email if the new one was rejected by domain check
        const mergedEmail = choosePreferredRoleEmail(
          normalizedRole ?? match.role,
          sanitizeEmail(match.email, uniDomain),
          validatedEmail,
          uniDomain,
        );
        const mergedPhone = normalizedPhone ?? sanitizePhone(match.phone);
        const mergedSources = new Set<string>(match.sources || []);
        if (st.source_url) mergedSources.add(st.source_url);
        if (st.sources) st.sources.forEach((s) => mergedSources.add(s));

        // Only carry over the new record's provenance when the corresponding
        // value is actually present/accepted; otherwise a new "none" would
        // clobber the source of a preserved phone/LinkedIn/email.
        const stPhoneSource = st.phone_source as PhoneSource | undefined;
        const stLinkedinSource = st.linkedin_source as LinkedInSource | undefined;
        const stEmailSource = st.email_source as EmailSource | undefined;

        await ctx.db.patch(match._id, {
          name: st.name ?? match.name,
          role: normalizedRole ?? sanitizeRole(match.role) ?? match.role,
          email: mergedEmail ? mergedEmail.toLowerCase().trim() : match.email,
          phone: mergedPhone,
          phone_source: normalizedPhone
            ? stPhoneSource ?? match.phone_source
            : match.phone_source,
          linkedin_url: st.linkedin_url ?? match.linkedin_url,
          linkedin_source: st.linkedin_url
            ? stLinkedinSource ?? match.linkedin_source
            : match.linkedin_source,
          contact_confidence:
            st.contact_confidence ?? match.contact_confidence,
          source: args.source ?? match.source ?? "deep_enrichment",
          source_url: st.source_url ?? match.source_url,
          email_source: validatedEmail
            ? stEmailSource ?? match.email_source
            : match.email_source,
          last_enriched_source: st.source_url ?? match.last_enriched_source,
          last_enriched_at: now,
          sources: Array.from(mergedSources),
          updated_at: now,
        });
      } else {
        // Insert new
        const sources = st.sources ?? (st.source_url ? [st.source_url] : undefined);
        await ctx.db.insert("stakeholders", {
          university_id: args.university_id,
          name: st.name,
          role: normalizedRole,
          email: validatedEmail
            ? validatedEmail.toLowerCase().trim()
            : undefined,
          phone: normalizedPhone,
          phone_source: st.phone_source as PhoneSource | undefined,
          linkedin_url: st.linkedin_url,
          linkedin_source: st.linkedin_source as LinkedInSource | undefined,
          contact_confidence: st.contact_confidence,
          is_primary: false,
          source: args.source || "deep_enrichment",
          source_url: st.source_url,
          email_source: st.email_source as EmailSource | undefined,
          last_enriched_source: st.source_url,
          last_enriched_at: now,
          sources,
          created_at: now,
        });
      }
    }
  },
});

export const getByUniversityInternal = internalQuery({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    return all.filter((s) => {
      const isUGC = (s.source ?? "").toLowerCase().includes("ugc");
      const hasEmail = s.email && s.email !== "null";
      const hasPhone = s.phone && s.phone !== "null";

      if (isUGC && !hasEmail && !hasPhone) {
        return false;
      }
      return true;
    });
  },
});

export const getPrimaryInternal = internalQuery({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    const primary = await ctx.db
      .query("stakeholders")
      .withIndex("by_university_primary", (q) =>
        q.eq("university_id", args.university_id).eq("is_primary", true),
      )
      .first();

    if (primary) return primary;

    let all = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    all = all.filter((s) => {
      const isUGC = (s.source ?? "").toLowerCase().includes("ugc");
      const hasEmail = s.email && s.email !== "null";
      const hasPhone = s.phone && s.phone !== "null";
      if (isUGC && !hasEmail && !hasPhone) return false;
      return true;
    });

    return all[0] ?? null;
  },
});

export const updateLinkedinInternal = internalMutation({
  args: {
    id: v.id("stakeholders"),
    linkedin_url: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    const university = existing
      ? await ctx.db.get(existing.university_id)
      : null;
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    const patch: Partial<Doc<"stakeholders">> = {
      name: args.name ?? existing?.name,
      role: sanitizeRole(existing?.role) ?? existing?.role,
      phone: sanitizePhone(existing?.phone),
      email: sanitizeEmail(existing?.email, institutionDomain) ?? existing?.email,
    };
    if (args.linkedin_url !== undefined) {
      patch.linkedin_url = args.linkedin_url;
    } else {
      patch.linkedin_url = undefined;
    }
    await ctx.db.patch(args.id, patch as Doc<"stakeholders">);
  },
});

export const updateContactInternal = internalMutation({
  args: {
    id: v.id("stakeholders"),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    email_source: v.optional(
      v.union(
        v.literal("scraped"),
        v.literal("regex"),
        v.literal("inferred"),
        v.literal("linkedin"),
        v.literal("manual"),
      ),
    ),
    phone_source: v.optional(
      v.union(
        v.literal("scraped"),
        v.literal("regex"),
        v.literal("inferred"),
        v.literal("manual"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return;
    const university = await ctx.db.get(existing.university_id);
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    const sanitizedEmail = sanitizeEmail(args.email, institutionDomain);
    const normalizedPhone = sanitizePhone(args.phone);
    const patch: Partial<Doc<"stakeholders">> = {};
    if (args.email !== undefined && sanitizedEmail) {
      patch.email = sanitizedEmail;
      if (args.email_source) patch.email_source = args.email_source;
    }
    if (args.phone !== undefined && normalizedPhone) {
      patch.phone = normalizedPhone;
      if (args.phone_source) patch.phone_source = args.phone_source;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.id, patch as Doc<"stakeholders">);
    }
  },
});

export const dedupeSingletonRoleContactsInternal = internalMutation({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    const university = await ctx.db.get(args.university_id);
    const uniDomain = normalizeInstitutionDomain(university?.website);
    const stakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    const grouped = new Map<string, typeof stakeholders>();
    for (const stakeholder of stakeholders) {
      const normalizedRole = sanitizeRole(stakeholder.role);
      const normalizedPhone = sanitizePhone(stakeholder.phone);
      const normalizedEmail = sanitizeEmail(stakeholder.email, uniDomain);
      if (
        normalizedRole !== stakeholder.role ||
        normalizedPhone !== stakeholder.phone ||
        normalizedEmail !== stakeholder.email
      ) {
        await ctx.db.patch(stakeholder._id, {
          role: normalizedRole ?? stakeholder.role,
          phone: normalizedPhone,
          email: normalizedEmail,
        });
      }
      const role = normalizedRole?.trim();
      if (!role || !isSingletonRole(role)) continue;
      const bucket = grouped.get(role) ?? [];
      bucket.push({
        ...stakeholder,
        role,
        phone: normalizedPhone,
        email: normalizedEmail,
      });
      grouped.set(role, bucket);
    }

    for (const [role, group] of grouped) {
      if (group.length <= 1) continue;

      const sorted = [...group].sort((a, b) => {
        const preferredEmail = choosePreferredRoleEmail(
          role,
          a.email,
          b.email,
          uniDomain,
        );
        if (preferredEmail === b.email) return 1;
        if (preferredEmail === a.email) return -1;
        return stakeholderSignalScore(b) - stakeholderSignalScore(a);
      });
      const keeper = sorted[0];
      let mergedName = keeper.name;
      let mergedEmail = keeper.email;
      let mergedPhone = keeper.phone;
      let mergedLinkedin = keeper.linkedin_url;
      for (const duplicate of sorted.slice(1)) {
        if (duplicate._id === keeper._id) continue;
        mergedName = mergedName || duplicate.name;
        mergedEmail =
          choosePreferredRoleEmail(role, mergedEmail, duplicate.email, uniDomain) ||
          mergedEmail;
        mergedPhone = mergedPhone || duplicate.phone;
        mergedLinkedin = mergedLinkedin || duplicate.linkedin_url;
        await ctx.db.patch(keeper._id, {
          name: mergedName,
          email: mergedEmail,
          phone: mergedPhone,
          linkedin_url: mergedLinkedin,
        });
        await ctx.db.delete(duplicate._id);
      }
    }
  },
});

/**
 * One-time cleanup for a university's stakeholders:
 * 1. Delete `scraper`/`inferred` rows that duplicate a `deep_enrichment` (or
 *    `manual`) row for the same person (same name/email/phone group).
 * 2. Strip phone/LinkedIn from remaining `scraper` rows that have no
 *    `source_url` evidence, and set their contact_confidence to 0.5.
 * 3. Backfill missing provenance: `linkedin_source` verified against the URL
 *    slug/name, `phone_source`/`email_source` defaulted from the row's origin.
 * `dryRun: true` returns counts without mutating.
 */
export const cleanupStakeholdersInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const university = await ctx.db.get(args.university_id);
    const rows = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    const report: {
      deleted: Array<Record<string, unknown>>;
      stripped: Array<Record<string, unknown>>;
      backfilled: Array<Record<string, unknown>>;
    } = { deleted: [], stripped: [], backfilled: [] };

    // ─── 1. Delete scraper/inferred duplicates of verified deep rows ────────
    const groups: Doc<"stakeholders">[][] = [];
    for (const row of rows) {
      let bucket = groups.find((g) => {
        const rep = g[0];
        const nameMatch =
          rep.name && row.name && namesEquivalent(rep.name, row.name);
        const emailMatch =
          rep.email && row.email && rep.email.toLowerCase() === row.email.toLowerCase();
        const phoneMatch =
          rep.phone && row.phone && normalizeIndianPhone(rep.phone) === normalizeIndianPhone(row.phone);
        return nameMatch || emailMatch || phoneMatch;
      });
      if (!bucket) {
        bucket = [];
        groups.push(bucket);
      }
      bucket.push(row);
    }

    for (const group of groups) {
      const verified = group.filter(
        (r) => r.source === "deep_enrichment" || r.source === "manual",
      );
      const stale = group.filter(
        (r) => r.source === "scraper" || r.source === "inferred",
      );
      if (verified.length === 0 || stale.length === 0) continue;
      for (const row of stale) {
        report.deleted.push({ _id: row._id, name: row.name, role: row.role, email: row.email, phone: row.phone, linkedin_url: row.linkedin_url, source: row.source });
        if (!dryRun) await ctx.db.delete(row._id);
      }
    }

    // ─── 2 + 3. Strip unverified contacts + backfill provenance ─────────────
    const remaining = dryRun
      ? rows
      : await ctx.db
          .query("stakeholders")
          .withIndex("by_university", (q) =>
            q.eq("university_id", args.university_id),
          )
          .collect();

    for (const row of remaining) {
      const patch: Partial<Doc<"stakeholders">> = {};
      let changed = false;
      // When a phone/LinkedIn is stripped, its provenance must stay "none" —
      // the backfill pass below must not re-add "scraped"/"regex" for it.
      let stripped = false;

      // Scraper rows without a source URL have no evidence for phone/LinkedIn.
      if (row.source === "scraper" && !row.source_url) {
        const strippedContacts: Partial<Doc<"stakeholders">> = {};
        if (row.phone) {
          strippedContacts.phone = undefined;
          strippedContacts.phone_source = "none" as PhoneSource;
          changed = true;
        }
        if (row.linkedin_url) {
          strippedContacts.linkedin_url = undefined;
          strippedContacts.linkedin_source = "none" as LinkedInSource;
          changed = true;
        }
        if (typeof row.contact_confidence !== "number") {
          strippedContacts.contact_confidence = 0.5;
          changed = true;
        }
        if (Object.keys(strippedContacts).length > 0) {
          stripped = true;
          report.stripped.push({
            _id: row._id,
            name: row.name,
            source: row.source,
            patch: strippedContacts,
          });
          Object.assign(patch, strippedContacts);
        }
      }

      // Backfill linkedin_source with a name/URL verification pass. A
      // model-emitted "none" alongside a present URL is treated as missing.
      if (
        row.linkedin_url &&
        (!row.linkedin_source || row.linkedin_source === "none") &&
        !stripped
      ) {
        if (
          isLikelyValidLinkedIn(row.linkedin_url) &&
          linkedinMatchesName(row.name, row.linkedin_url)
        ) {
          patch.linkedin_source = "scraped" as LinkedInSource;
        } else {
          patch.linkedin_url = undefined;
          patch.linkedin_source = "none" as LinkedInSource;
        }
        changed = true;
      }

      if (
        row.phone &&
        (!row.phone_source || row.phone_source === "none") &&
        !stripped
      ) {
        patch.phone_source =
          row.source === "inferred"
            ? ("inferred" as PhoneSource)
            : row.source_url
              ? ("scraped" as PhoneSource)
              : ("regex" as PhoneSource);
        changed = true;
      }

      if (row.email && !row.email_source) {
        patch.email_source =
          row.source === "deep_enrichment"
            ? ("scraped" as EmailSource)
            : ("regex" as EmailSource);
        changed = true;
      }

      // Consistency pass (also makes the cleanup idempotent): a value that was
      // cleared must not carry a non-"none" provenance.
      if (!row.linkedin_url && row.linkedin_source && row.linkedin_source !== "none") {
        patch.linkedin_source = "none" as LinkedInSource;
        changed = true;
      }
      if (!row.phone && row.phone_source && row.phone_source !== "none") {
        patch.phone_source = "none" as PhoneSource;
        changed = true;
      }

      if (!changed) continue;
      report.backfilled.push({
        _id: row._id,
        name: row.name,
        source: row.source,
        patch,
      });
      if (!dryRun && Object.keys(patch).length > 0) {
        await ctx.db.patch(row._id, patch as Doc<"stakeholders">);
      }
    }

    return {
      university_id: args.university_id,
      university_name: university?.university_name ?? null,
      dryRun,
      rows: rows.length,
      deleted: report.deleted.length,
      stripped: report.stripped.length,
      backfilled: report.backfilled.length,
      deletedRows: report.deleted,
      backfillDetails: report.backfilled,
    };
  },
});

export const getByIdInternal = internalQuery({
  args: { id: v.id("stakeholders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stakeholders")
      .withIndex("by_email", (q) =>
        q.eq("email", args.email.toLowerCase().trim()),
      )
      .first();
  },
});

function isClericalOrSupportRole(role?: string | null): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return /\b(staff|assistant|attendant|stenographer|technician|superintendent|operator|driver|peon|clerk)\b/.test(lower);
}

function isDecisionMakerRole(role?: string | null): boolean {
  const canonical = role ? normalizeStakeholderRole(role) : undefined;
  if (!canonical) return false;
  return [
    "Owner",
    "President",
    "Chairman",
    "Chairperson",
    "Chancellor",
    "Vice Chancellor",
    "Pro Vice Chancellor",
    "Advisor",
    "Advisor to Chancellor",
    "Registrar",
    "Dy Registrar",
    "Joint Registrar",
    "Dean",
    "Deputy Dean",
    "Assistant Dean",
    "Dean Student Welfare",
    "Dean Student Affairs",
    "Director Administration",
    "Chief Warden",
    "Controller of Examinations",
    "Deputy Controller of Examinations",
    "Finance Officer",
    "Chief Finance Officer",
    "Librarian",
    "Head of Department",
    "Placement Officer",
    "Public Relations Officer",
    "Director",
    "Joint Director",
    "Deputy Director",
    "Associate Director",
  ].includes(canonical);
}

export const cleanupLegacyStakeholders = mutation({
  args: {
    university_id: v.id("universities"),
    dry_run: v.optional(v.boolean()),
    enriched_before: v.optional(v.number()),
    bad_sources: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const dryRun = args.dry_run ?? true;
    const badSources = (args.bad_sources ?? ["scraper", "Scribd"]).map((s) =>
      s.toLowerCase(),
    );
    const cutoff = args.enriched_before;
    const all = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();

    const toDelete = all.filter((s) => {
      const source = (s.source ?? "").toLowerCase();
      const sources = (s.sources ?? []).join(" ").toLowerCase();
      const role = s.role;
      const hasContact = !!s.email || !!s.phone || !!s.linkedin_url;
      const lastEnriched = s.last_enriched_at ?? s.updated_at ?? s.created_at ?? 0;

      // Purge known bad / low-quality sources and cross-contamination.
      if (badSources.some((b) => source.includes(b) || sources.includes(b))) {
        return true;
      }

      // Purge stale records that were never refreshed during the latest run.
      if (cutoff != null && lastEnriched < cutoff && !isSingletonRole(role)) {
        return true;
      }

      // Purge support/clerical staff with no decision authority.
      if (isClericalOrSupportRole(role)) {
        return true;
      }

      // Drop orphaned records with no contact info unless they are a high-value singleton role.
      if (!hasContact && !isDecisionMakerRole(role) && !isSingletonRole(role)) {
        return true;
      }

      return false;
    });

    if (!dryRun) {
      for (const s of toDelete) {
        await ctx.db.delete(s._id);
      }
    }

    return {
      dry_run: dryRun,
      deleted: dryRun ? 0 : toDelete.length,
      would_delete: toDelete.length,
      ids: toDelete.map((s) => s._id),
    };
  },
});

export const purgeTestStakeholders = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const all = await ctx.db.query("stakeholders").collect();
    const toDelete = all.filter((s) => {
      const email = (s.email ?? "").toLowerCase();
      const name = (s.name ?? "").toLowerCase();
      return (
        email.includes("@example.") ||
        email.includes("test@") ||
        name.startsWith("test ") ||
        name === "test"
      );
    });
    for (const s of toDelete) {
      await ctx.db.delete(s._id);
    }
    return { deleted: toDelete.length };
  },
});
