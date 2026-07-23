"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { extractContactsFromMarkdown } from "../lib/scrapers";
import * as Sentry from "@sentry/node";

/**
 * Dedicated anti-ragging page scraper.
 * UGC mandates every Indian university to list anti-ragging committee members
 * with their mobile numbers. These pages are a goldmine for real contact data.
 */

const ANTI_RAGGING_PATHS = [
  "/anti-ragging",
  "/anti-ragging-committee",
  "/antiragging",
  "/anti_ragging",
  "/anti-raging",
  "/antiraggingcommittee",
  "/grievance/anti-ragging",
  "/student-affairs/anti-ragging",
  "/welfare/anti-ragging",
];

export const scrapeAntiRagging = internalAction({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      if (!university) throw new Error("University not found");
      if (!university.website) {
        console.warn(`[AntiRagging] ${university.university_name} has no website.`);
        return { success: false, reason: "No website" };
      }

      const url = typeof university.website === "string" ? university.website : "";
      const baseUrl = url.replace(/\/$/, "");
      const uniName = university.university_name;

      console.log(`[AntiRagging] Scanning ${uniName}...`);

      // .gov.in domains are IP-blocked from cloud envs — every Jina request times out.
      // Skip the slow loop and return immediately so the orchestrator stays under 30s.
      if (url.includes(".gov.in")) {
        console.warn(`[AntiRagging] Skipping ${uniName} — .gov.in domains unreachable from cloud.`);
        return { success: false, reason: "No anti-ragging pages" };
      }

      // Try each known anti-ragging path via Jina Reader (free)
      const allEmails = new Set<string>();
      const allPhones = new Set<string>();
      let foundPages = 0;

      for (const path of ANTI_RAGGING_PATHS) {
        try {
          const pageUrl = `${baseUrl}${path}`;
          const res = await fetch(`https://r.jina.ai/${encodeURIComponent(pageUrl)}`, {
            headers: { Accept: "text/plain" },
            signal: AbortSignal.timeout(12000),
          });
          if (!res.ok) continue;

          const text = await res.text();
          if (text.length < 100) continue;

          foundPages++;
          const contacts = extractContactsFromMarkdown(text);
          contacts.emails.forEach((e) => allEmails.add(e));
          contacts.phones.forEach((p) => allPhones.add(p));

          console.log(`[AntiRagging] ${path}: ${contacts.emails.length} emails, ${contacts.phones.length} phones`);
        } catch {
          // Ignore failures for individual paths
        }
      }

      if (foundPages === 0) {
        console.warn(`[AntiRagging] No anti-ragging pages found for ${uniName}.`);
        return { success: false, reason: "No anti-ragging pages" };
      }

      const emails = Array.from(allEmails);
      const phones = Array.from(allPhones);

      console.log(`[AntiRagging] ${uniName}: ${emails.length} emails, ${phones.length} phones from ${foundPages} pages.`);

      // Persist both emails and phones so UGC-mandated committee contacts survive downstream cleanup.
      const emailStakeholders = emails.map((email) => ({
        name: undefined,
        role: "Anti-Ragging Committee",
        email,
        phone: undefined,
        email_source: "scraped" as const,
        phone_source: undefined,
      }));
      const phoneStakeholders = phones.map((phone) => ({
        name: undefined,
        role: "Anti-Ragging Committee",
        email: undefined,
        phone,
        email_source: undefined,
        phone_source: "scraped" as const,
      }));

      if (emailStakeholders.length > 0 || phoneStakeholders.length > 0) {
        const stakeholders = [...emailStakeholders, ...phoneStakeholders];
        await ctx.runMutation(internal.stakeholders.upsertBulkInternal, {
          university_id: args.universityId,
          stakeholders,
          source: "anti_ragging",
        });
      }

      return {
        success: true,
        emails,
        phones,
        pagesFound: foundPages,
      };
    } catch (e) {
      console.error("[AntiRagging] Fatal error:", e);
      Sentry.captureException(e, { extra: { universityId: args.universityId } });
      return { success: false, error: String(e) };
    }
  },
});
