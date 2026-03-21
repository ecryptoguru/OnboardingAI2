"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { callGemini, TEMP, MODELS } from "../lib/llm";
import { recommendModules, suggestPricingTier } from "../lib/moduleRecommender";
import { PROPOSAL_SYSTEM_PROMPT, PROPOSAL_SCHEMA } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

/**
 * Generates a full AI proposal for a university.
 * No PDF — content is emailed directly as rich HTML.
 */
export const generateProposal = action({
  args: {
    universityId: v.id("universities"),
    proposalId: v.id("proposals"),
    stakeholderId: v.optional(v.id("stakeholders")),
  },
  handler: async (ctx, args) => {
    const uni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    if (!uni) throw new Error("University not found");

    const signals = await ctx.runQuery(internal.signals.listByUniversityInternal, {
      university_id: args.universityId,
    });

    let stakeholderName = undefined;
    let stakeholderRole = undefined;
    if (args.stakeholderId) {
      const st = await ctx.runQuery(internal.stakeholders.getByIdInternal, { id: args.stakeholderId });
      if (st) { stakeholderName = st.name; stakeholderRole = st.role; }
    }

    const recommendedModules = recommendModules(uni, signals);
    const pricingTier = suggestPricingTier(uni);

    const systemPrompt = PROPOSAL_SYSTEM_PROMPT({
      universityName: uni.university_name,
      universityType: uni.type || "Institution",
      leadTier: uni.lead_tier || "Standard",
      recommendedModules: recommendedModules.map((m) => m.name),
      pricingTier,
      signals: signals.map((s: any) => s.content),
      stakeholderName,
      stakeholderRole,
    });

    try {
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey) as string | null;
      const response = await callGemini({
        apiKey,
        systemPrompt,
        userPrompt: "Generate the proposal JSON now.",
        temperature: TEMP.creative,
        model: MODELS.complex,
        responseAsJson: true,
        responseSchema: PROPOSAL_SCHEMA,
      });

      const proposalContent = JSON.parse(response);

      // Set status to "ready" immediately — no PDF step needed
      await ctx.runMutation(internal.proposals.updateInternal, {
        id: args.proposalId,
        agenda: Array.isArray(proposalContent.agenda)
          ? proposalContent.agenda.join("\n")
          : (proposalContent.agenda || ""),
        proposal_json: JSON.stringify(proposalContent),
        recommended_modules: recommendedModules.map(m => m.id),
        status: "ready",
      });

      return { success: true, proposalId: args.proposalId };
    } catch (e) {
      console.error("[ProposalGenerator] Fatal error:", e);
      Sentry.captureException(e, { extra: { universityId: args.universityId, proposalId: args.proposalId } });
      return { success: false, error: String(e) };
    }
  },
});

/**
 * Emails the proposal content as rich HTML directly to stakeholder(s) + optional CC list.
 */
export const emailProposal = action({
  args: {
    proposalId: v.id("proposals"),
    toEmails: v.array(v.string()),
    ccEmails: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.runQuery(internal.proposals.getInternal, { id: args.proposalId });
    if (!proposal || !proposal.proposal_json) throw new Error("Proposal content not found");

    const uni = await ctx.runQuery(internal.universities.getInternal, { universityId: proposal.university_id });
    if (!uni) throw new Error("University not found");

    let stakeholderName = "Leadership Team";
    if (proposal.stakeholder_id) {
      const st = await ctx.runQuery(internal.stakeholders.getByIdInternal, { id: proposal.stakeholder_id });
      if (st?.name) stakeholderName = st.name;
    }

    const c = JSON.parse(proposal.proposal_json);

    // Handle both old and new executive_summary shapes
    const es = c.executive_summary;
    const hookText = typeof es === "string" ? es : (es?.hook || es?.why_now || "");
    const whyNow  = typeof es === "object" && es ? (es.why_now || "") : "";
    const vision  = typeof es === "object" && es ? (es.vision_statement || "") : "";

    const benefitsList = Array.isArray(c.key_benefits)
      ? c.key_benefits.map((b: string) => `<li style="margin-bottom:8px;color:#374151;">${b}</li>`).join("")
      : "";

    const nextStepsList = Array.isArray(c.next_steps)
      ? c.next_steps.map((s: string, i: number) =>
          `<li style="margin-bottom:8px;color:#374151;"><strong>${i + 1}.</strong> ${s}</li>`
        ).join("")
      : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:32px 40px;">
      <p style="margin:0 0 4px;color:#bfdbfe;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">Partnership Proposal</p>
      <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;">${uni.university_name}</h1>
      <p style="margin:8px 0 0;color:#93c5fd;font-size:14px;">Prepared for ${stakeholderName}</p>
    </div>

    <div style="padding:32px 40px;">

      <!-- Executive Hook -->
      <p style="color:#1e40af;font-size:16px;font-weight:600;line-height:1.6;margin:0 0 16px;">${hookText}</p>
      ${whyNow ? `<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">${whyNow}</p>` : ""}
      ${vision  ? `<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 24px;font-style:italic;">${vision}</p>` : ""}

      ${c.problem_statement ? `
      <div style="background:#fef9f0;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#d97706;letter-spacing:1px;text-transform:uppercase;">The Challenge</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">${c.problem_statement}</p>
      </div>` : ""}

      ${c.solution_overview ? `
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1e40af;letter-spacing:1px;text-transform:uppercase;">Our Solution</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">${c.solution_overview}</p>
      </div>` : ""}

      ${benefitsList ? `
      <div style="background:#f0fdf4;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#15803d;letter-spacing:1px;text-transform:uppercase;">Key Benefits for ${uni.university_name}</p>
        <ul style="margin:0;padding-left:20px;">${benefitsList}</ul>
      </div>` : ""}

      ${c.roi_summary ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1e40af;letter-spacing:1px;text-transform:uppercase;">Expected ROI</p>
        <p style="margin:0;color:#1e3a8a;font-size:14px;line-height:1.7;font-weight:600;">${c.roi_summary}</p>
      </div>` : ""}

      ${nextStepsList ? `
      <div style="margin-bottom:28px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#374151;letter-spacing:1px;text-transform:uppercase;">Proposed Next Steps</p>
        <ol style="margin:0;padding-left:20px;">${nextStepsList}</ol>
      </div>` : ""}

      <!-- CTA block -->
      <div style="background:#1e40af;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px;">
        <p style="margin:0 0 4px;color:#bfdbfe;font-size:13px;">Ready to explore this partnership?</p>
        <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">Reply to schedule a call with us</p>
      </div>

      <!-- Footer -->
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.7;">
        Warm regards,<br>
        <strong style="color:#374151;">Ashish Gupta</strong><br>
        Partnerships Lead — <strong style="color:#374151;">Fretbox</strong><br>
        <a href="mailto:outreach@fretbox.in" style="color:#3b82f6;text-decoration:none;">outreach@fretbox.in</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const plainText = [hookText, whyNow, vision, c.problem_statement, c.solution_overview, c.roi_summary]
      .filter(Boolean).join("\n\n");

    const sendResult: { success: boolean; error?: string } = await ctx.runAction(api.actions.email.sendEmail, {
      to: args.toEmails,
      cc: args.ccEmails && args.ccEmails.length > 0 ? args.ccEmails : undefined,
      subject: `Fretbox Partnership Proposal — ${uni.university_name}`,
      text: plainText,
      html,
    });

    if (sendResult.success) {
      await ctx.runMutation(internal.proposals.updateInternal, {
        id: args.proposalId,
        status: "sent",
      });
    }

    return sendResult;
  },
});

