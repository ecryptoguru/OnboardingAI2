"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { callClaude, TEMP } from "../lib/llm";
import { recommendModules, suggestPricingTier, MODULES } from "../lib/moduleRecommender";
import { ProposalDocument } from "../lib/proposalPdf";
import { PROPOSAL_SYSTEM_PROMPT } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";
import { Doc } from "../_generated/dataModel";

/**
 * Generates a full AI proposal for a university.
 * Usually triggered after a meeting is booked.
 */
export const generateProposal = action({
  args: {
    universityId: v.id("universities"),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    // 1. Fetch data
    const uni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    if (!uni) throw new Error("University not found");

    const signals = await ctx.runQuery(internal.signals.listByUniversityInternal, {
      university_id: args.universityId,
    });

    // 2. Automated Module Recommendation
    const recommendedModules = recommendModules(uni, signals);
    const pricingTier = suggestPricingTier(uni);

    // 3. AI Generation of Agenda & Content
    const systemPrompt = PROPOSAL_SYSTEM_PROMPT({
      universityName: uni.university_name,
      universityType: uni.type || "Institution",
      leadTier: uni.lead_tier || "Standard",
      recommendedModules: recommendedModules.map((m) => m.name),
      pricingTier,
      signals: signals.map((s: any) => s.content),
    });

    try {
      const response = await callClaude({
        system: systemPrompt,
        userMessage: "Generate the proposal JSON now.",
        temperature: TEMP.creative,
      });

      // Clean response (Claude sometimes wraps in markdown code blocks)
      const jsonStr = response.replace(/```json|```/g, "").trim();
      const proposalContent = JSON.parse(jsonStr);

      // 4. Update the proposal record
      await ctx.runMutation(internal.proposals.updateInternal, {
        id: args.proposalId,
        agenda: proposalContent.agenda.join("\n"),
        proposal_json: jsonStr,
        recommended_modules: recommendedModules.map(m => m.id),
        status: "ready", // Still draft until PDF is ready? No, ready is fine.
      });

      // 5. Schedule PDF Generation
      await ctx.scheduler.runAfter(0, (api.actions as any).proposals.renderToPdf, {
        proposalId: args.proposalId,
      });

      return { success: true, proposalId: args.proposalId };
    } catch (e) {
      console.error("[ProposalGenerator] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId, proposalId: args.proposalId },
      });
      return { success: false, error: String(e) };
    }
  },
});

/**
 * Renders a proposal to a PDF and stores it in Convex storage.
 */
export const renderToPdf = action({
  args: {
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    // 1. Fetch data
    const proposal = await ctx.runQuery(internal.proposals.getInternal, {
      id: args.proposalId,
    });
    if (!proposal || !proposal.proposal_json) throw new Error("Proposal content not found");

    const uni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: proposal.university_id,
    });
    if (!uni) throw new Error("University not found");

    const content = JSON.parse(proposal.proposal_json);
    const recommendedModuleObjects = (proposal.recommended_modules || [])
      .map((id: any) => Object.values(MODULES).find((m: any) => m.id === id))
      .filter((m: any): m is NonNullable<typeof m> => !!m);

    const pdfData = {
      universityName: uni.university_name,
      agenda: content.agenda,
      executiveSummary: content.executive_summary,
      problemStatement: content.problem_statement,
      solutionOverview: content.solution_overview,
      modules: recommendedModuleObjects,
      date: new Date(proposal.meeting_date || Date.now()).toLocaleDateString(),
    };

    let uniName = "Institution";
    try {
      // 2. Render to Buffer
      const buffer = await renderToBuffer(
        React.createElement(ProposalDocument, { data: pdfData }) as any
      );

      // 3. Store in Convex Storage
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(buffer)], { type: "application/pdf" }));

      // 4. Update Proposal
      await ctx.runMutation(internal.proposals.updateInternal, {
        id: args.proposalId,
        pdf_storage_id: storageId,
      });

      return { success: true, storageId };
    } catch (e) {
      console.error("[PDF] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { proposalId: args.proposalId },
      });
      return { success: false, error: String(e) };
    }
  },
});
