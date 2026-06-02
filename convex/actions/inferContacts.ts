"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { isValidEmail } from "../lib/utils";
import * as Sentry from "@sentry/node";

/**
 * Role-based email inference action.
 * When university websites don't list individual emails, we can infer
 * common patterns based on the person's role and the university domain.
 */

const ROLE_PATTERNS: Record<string, string[]> = {
  "Vice Chancellor": ["vc", "vicechancellor", "vice-chancellor", "rector"],
  "Pro Vice Chancellor": ["provc", "pro-vice-chancellor"],
  "Registrar": ["registrar", "reg", "controller", "coe"],
  "Dean Student Welfare": ["dsw", "dean-student-welfare", "student-welfare"],
  "Dean Student Affairs": ["dsa", "dean-student-affairs", "student-affairs"],
  "Director Administration": ["director-admin", "admin-director", "administration"],
  "Chief Warden": ["warden", "chief-warden", "hostel-warden", "hostel"],
  "Controller of Examinations": ["coe", "controller-exams", "examination"],
  "Finance Officer": ["finance", "accounts", "cfo", "fo"],
  "Librarian": ["library", "librarian"],
  "Placement Officer": ["placement", "tpo", "training", "career"],
  "Public Relations Officer": ["pro", "public-relations", "pr"],
  "Principal": ["principal", "director"],
  "Head of Department": ["hod", "head"],
};

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

      const url = typeof university.website === "string" ? university.website : "";
      const domain = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
      if (!domain || domain.includes("/")) {
        return { success: false, reason: "Invalid domain" };
      }

      const uniName = university.university_name;
      console.log(`[InferContacts] Inferring contacts for ${uniName} @ ${domain}`);

      // Get existing stakeholders to avoid duplicates
      const existing = await ctx.runQuery(
        internal.stakeholders.getByUniversityInternal,
        { university_id: args.universityId },
      );
      const existingEmails = new Set(
        existing.map((e: { email?: string }) => e.email?.toLowerCase()).filter(Boolean),
      );

      const inferred: Array<{ name?: string; role: string; email: string; source: string }> = [];

      for (const [role, patterns] of Object.entries(ROLE_PATTERNS)) {
        for (const pattern of patterns) {
          const email = `${pattern}@${domain}`;
          if (isValidEmail(email) && !existingEmails.has(email.toLowerCase())) {
            inferred.push({
              role,
              email,
              source: "inferred",
            });
            existingEmails.add(email.toLowerCase());
            break; // Only one email per role
          }
        }
      }

      if (inferred.length === 0) {
        console.log(`[InferContacts] No new inferred contacts for ${uniName}.`);
        return { success: true, inferred: 0 };
      }

      // Insert inferred contacts as stakeholders
      await ctx.runMutation(internal.stakeholders.bulkInsertInternal, {
        university_id: args.universityId,
        stakeholders: inferred.map((st) => ({
          name: undefined,
          role: st.role,
          email: st.email,
          phone: undefined,
          email_source: "inferred",
          phone_source: undefined,
        })),
        source: "inferred",
      });

      console.log(`[InferContacts] Inserted ${inferred.length} inferred contacts for ${uniName}.`);
      return { success: true, inferred: inferred.length };
    } catch (e) {
      console.error("[InferContacts] Fatal error:", e);
      Sentry.captureException(e, { extra: { universityId: args.universityId } });
      return { success: false, error: String(e) };
    }
  },
});
