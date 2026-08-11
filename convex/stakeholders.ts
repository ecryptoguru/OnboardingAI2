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
  isRoleBasedInstitutionEmail,
  isSingletonRole,
  normalizeInstitutionDomain,
  normalizeStakeholderRole,
} from "./lib/contactInference";
import { normalizeIndianPhone } from "./lib/phone";

// Source type aliases matching the schema union types
type EmailSource = "scraped" | "regex" | "inferred" | "linkedin" | "manual";
type PhoneSource = "scraped" | "regex" | "inferred" | "manual";

// Normalize name for fuzzy matching: remove titles, then split into tokens,
// sort alphabetically, and join. This makes "R. P. Singh" and "Rajesh Prasad Singh"
// share the same surname token even if initials differ.
function normalizeName(n?: string) {
  const raw = (n || "")
    .toLowerCase()
    .replace(/\b(dr|prof|professor|mr|mrs|ms|shri|smt|er|engg|arch)\b/g, "")
    .replace(/\./g, " ")
    .replace(/[,\-]/g, " ");
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
  return tokens.sort().join(" ");
}

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
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const all = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    // Carefully exclude UGC stakeholders that have no contact info to prevent duplicates alongside rich AI data
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

export const listByUniversities = query({
  args: { university_ids: v.array(v.id("universities")) },
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
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const university = await ctx.db.get(args.university_id);
    const institutionDomain = normalizeInstitutionDomain(university?.website);
    for (const st of args.stakeholders) {
      await ctx.db.insert("stakeholders", {
        university_id: args.university_id,
        name: st.name,
        role: sanitizeRole(st.role),
        email: sanitizeEmail(st.email, institutionDomain),
        phone: sanitizePhone(st.phone),
        is_primary: false,
        source: args.source || "scraper",
        email_source: st.email_source as EmailSource | undefined,
        phone_source: st.phone_source as PhoneSource | undefined,
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
        linkedin_url: v.optional(v.string()),
        email_source: v.optional(v.string()),
        phone_source: v.optional(v.string()),
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

        // Robust domain check: exact match or subdomain of uniDomain
        const isMatch =
          genericDomains.includes(emailDomain) ||
          emailDomain === uniDomain ||
          emailDomain.endsWith(`.${uniDomain}`);

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

        // Fuzzy name match (e.g. "Dr. D. P. Singh" vs "D P Singh")
        // NEW: also check that roles aren't conflicting — two different people
        // can share a similar name but have different roles.
        if (
          st.name &&
          e.name &&
          normalizeName(e.name) === normalizeName(st.name) &&
          normalizeName(st.name).length > 3
        ) {
          const roleA = normalizeStakeholderRole(e.role) || "";
          const roleB = normalizeStakeholderRole(normalizedRole) || "";
          if (roleA && roleB && roleA !== roleB) {
            return false;
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
        await ctx.db.patch(match._id, {
          name: st.name ?? match.name,
          role: normalizedRole ?? sanitizeRole(match.role) ?? match.role,
          email: mergedEmail ? mergedEmail.toLowerCase().trim() : match.email,
          phone: mergedPhone,
          linkedin_url: st.linkedin_url ?? match.linkedin_url,
          source: args.source ?? match.source ?? "deep_enrichment",
          email_source:
            (st.email_source as EmailSource | undefined) ?? match.email_source,
          phone_source:
            (st.phone_source as PhoneSource | undefined) ?? match.phone_source,
        });
      } else {
        // Insert new
        await ctx.db.insert("stakeholders", {
          university_id: args.university_id,
          name: st.name,
          role: normalizedRole,
          email: validatedEmail
            ? validatedEmail.toLowerCase().trim()
            : undefined,
          phone: normalizedPhone,
          linkedin_url: st.linkedin_url,
          is_primary: false,
          source: args.source || "deep_enrichment",
          email_source: st.email_source as EmailSource | undefined,
          phone_source: st.phone_source as PhoneSource | undefined,
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
