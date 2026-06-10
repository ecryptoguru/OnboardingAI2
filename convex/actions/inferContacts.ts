"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { isValidEmail } from "../lib/utils";
import {
  inferPreferredRoleEmail,
  isSingletonRole,
  normalizeInstitutionDomain,
  normalizeStakeholderRole,
} from "../lib/contactInference";
import { isDecisionMakerRole } from "../lib/stakeholderQuality";
import * as Sentry from "@sentry/node";

/**
 * Role-based email inference action.
 * When university websites don't list individual emails, we can infer
 * common patterns based on the person's role and the university domain.
 */

export const inferContacts = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      if (!university) throw new Error("University not found");
      if (!university.website) {
        return { success: false, reason: "No website" };
      }

      const url =
        typeof university.website === "string" ? university.website : "";
      const domain = normalizeInstitutionDomain(url);
      if (!domain || domain.includes("/")) {
        return { success: false, reason: "Invalid domain" };
      }

      const uniName = university.university_name;
      console.log(
        `[InferContacts] Inferring contacts for ${uniName} @ ${domain}`,
      );

      // Get existing stakeholders to avoid duplicates
      const existing = await ctx.runQuery(
        internal.stakeholders.getByUniversityInternal,
        { university_id: args.universityId },
      );
      const existingEmails = new Set(
        existing
          .map((e: { email?: string }) => e.email?.toLowerCase())
          .filter((email): email is string => Boolean(email)),
      );

      const existingRoles = new Set<string>(
        existing
          .map((entry: { role?: string; name?: string; email?: string }) => {
            const hasRealContact = !!entry.name || !!entry.email;
            return hasRealContact
              ? normalizeStakeholderRole(entry.role)
              : undefined;
          })
          .filter((role): role is string => Boolean(role)),
      );

      const inferred: Array<{
        name?: string;
        role: string;
        email: string;
        source: string;
      }> = [];

      for (const role of existingRoles) {
        if (!role || !isDecisionMakerRole(role) || !isSingletonRole(role)) {
          continue;
        }
        const email = inferPreferredRoleEmail(role, domain);
        if (
          email &&
          isValidEmail(email) &&
          !existingEmails.has(email.toLowerCase())
        ) {
          inferred.push({
            role,
            email,
            source: "inferred",
          });
          existingEmails.add(email.toLowerCase());
        }
      }

      if (inferred.length === 0) {
        console.log(`[InferContacts] No new inferred contacts for ${uniName}.`);
        return { success: true, inferred: 0 };
      }

      // Insert inferred contacts as stakeholders
      await ctx.runMutation(internal.stakeholders.upsertBulkInternal, {
        university_id: args.universityId,
        stakeholders: inferred.map((st) => ({
          name: undefined,
          role: st.role,
          email: st.email,
          phone: undefined,
          linkedin_url: undefined,
          email_source: "inferred",
          phone_source: undefined,
        })),
        source: "inferred",
      });
      await ctx.runMutation(
        internal.stakeholders.dedupeSingletonRoleContactsInternal,
        {
          university_id: args.universityId,
        },
      );

      console.log(
        `[InferContacts] Inserted ${inferred.length} inferred contacts for ${uniName}.`,
      );
      return { success: true, inferred: inferred.length };
    } catch (e) {
      console.error("[InferContacts] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  },
});
