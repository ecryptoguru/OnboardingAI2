import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

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
  const tokens = (n || "").toLowerCase().replace(/\./g, " ").split(/\s+/).filter((t) => t.length > 0);
  return tokens[tokens.length - 1] || "";
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
    const normalizedEmail = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("stakeholders")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name ?? existing.name,
        role: args.role ?? existing.role,
        phone: args.phone ?? existing.phone,
        linkedin_url: args.linkedin_url ?? existing.linkedin_url,
      });
      return existing._id;
    }

    return await ctx.db.insert("stakeholders", {
      university_id: args.university_id,
      email: normalizedEmail,
      name: args.name,
      role: args.role,
      phone: args.phone,
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
    return await ctx.db.insert("stakeholders", {
      ...args,
      email: args.email ? args.email.toLowerCase().trim() : undefined,
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
    if (fields.email) fields.email = fields.email.toLowerCase().trim();
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
    return await ctx.db.insert("stakeholders", {
      ...args,
      email: args.email ? args.email.toLowerCase().trim() : undefined,
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
    for (const st of args.stakeholders) {
      await ctx.db.insert("stakeholders", {
        university_id: args.university_id,
        name: st.name,
        role: st.role,
        email: st.email ? st.email.toLowerCase().trim() : undefined,
        phone: st.phone,
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
    const uniWebsite =
      university?.website
        ?.toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
        .replace(/^www\./, "") || "";
    const uniDomain = uniWebsite.split("/")[0];

    for (const st of args.stakeholders) {
      // 1. Block generic placeholder emails and names
      const emailLower = (st.email || "").toLowerCase();
      const nameLower = (st.name || "").toLowerCase();
      const roleLower = (st.role || "").toLowerCase();

      // UGC Check (Strictly forbidden as per user rule)
      const isUGC =
        emailLower.includes("ugc.ac.in") ||
        nameLower.includes("ugc") ||
        roleLower.includes("ugc");

      const isPlaceholder =
        isUGC ||
        (st.email &&
          (emailLower.includes("@example.") || emailLower.includes("test@"))) ||
        (st.name &&
          (nameLower.startsWith("test ") ||
            nameLower === "test" ||
            nameLower === "unknown" ||
            nameLower === "n/a" ||
            nameLower === "none"));

      // Name-Role Collision: If name matches role, it's just a position title, not a person
      const isNameRoleCollision = st.name && st.role && nameLower === roleLower;

      if (isPlaceholder || isNameRoleCollision) {
        console.log(
          `[stakeholders] Skipping invalid/placeholder stakeholder: ${st.name} <${st.email}> (Reason: ${isUGC ? "UGC" : isNameRoleCollision ? "Name=Role" : "Placeholder"})`,
        );
        continue;
      }

      // 2. Domain matching: strictly prevent cross-institution data (e.g. IIT BBS email for XIM)
      let validatedEmail = st.email;
      if (st.email && uniDomain) {
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
            `[stakeholders] Rejecting cross-domain email: ${st.email} for university domain: ${uniDomain}`,
          );
          validatedEmail = undefined;
        }
      }

      if (!st.name && !validatedEmail) continue;

      const match = existingStakeholders.find((e) => {
        if (
          st.email &&
          e.email &&
          e.email.toLowerCase() === st.email.toLowerCase()
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
          const roleA = (e.role || "").toLowerCase().trim();
          const roleB = (st.role || "").toLowerCase().trim();
          // If both have roles and they're clearly different → different person
          if (roleA && roleB && roleA !== roleB &&
              !roleA.includes(roleB) && !roleB.includes(roleA)) {
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
          const roleA = (e.role || "").toLowerCase().trim();
          const roleB = (st.role || "").toLowerCase().trim();
          if (roleA && roleB && roleA !== roleB) return false;
          return true;
        }

        // Fallback: If both have a role, and the roles match exactly (e.g., both "Vice Chancellor"),
        // treat it as an update to the SAME stakeholder position rather than duplicating the role.
        if (
          st.role &&
          e.role &&
          e.role.toLowerCase() === st.role.toLowerCase()
        ) {
          // Only match by role if they don't have explicitly conflicting emails
          if (
            st.email &&
            e.email &&
            st.email.toLowerCase() !== e.email.toLowerCase()
          )
            return false;
          return true;
        }

        return false;
      });

      if (match) {
        // Prefer NEW enrichment data over old — this fills in missing emails/phones from re-enrichment
        // Preserve existing email if the new one was rejected by domain check
        await ctx.db.patch(match._id, {
          name: st.name ?? match.name,
          role: st.role ?? match.role,
          email: validatedEmail
            ? validatedEmail.toLowerCase().trim()
            : match.email,
          phone: st.phone ?? match.phone,
          linkedin_url: st.linkedin_url ?? match.linkedin_url,
          source: args.source ?? match.source ?? "deep_enrichment",
          email_source: (st.email_source as EmailSource | undefined) ?? match.email_source,
          phone_source: (st.phone_source as PhoneSource | undefined) ?? match.phone_source,
        });
      } else {
        // Insert new
        await ctx.db.insert("stakeholders", {
          university_id: args.university_id,
          name: st.name,
          role: st.role,
          email: validatedEmail
            ? validatedEmail.toLowerCase().trim()
            : undefined,
          phone: st.phone,
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
    linkedin_url: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { linkedin_url: args.linkedin_url });
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
