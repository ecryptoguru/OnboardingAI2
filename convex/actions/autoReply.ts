"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { TEMPLATES } from "../lib/emailTemplates";
import { withRetry } from "../lib/utils";

export const sendAutoReply = action({
  args: {
    universityId: v.id("universities"),
    stakeholderId: v.id("stakeholders"),
    classification: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch data
    const uni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    const st = await ctx.runQuery(internal.stakeholders.getByIdInternal, {
      id: args.stakeholderId,
    });

    if (!uni || !st || !st.email) return { success: false, reason: "Missing data" };

    // 2. Fetch active sequence (optional)
    const seq = await ctx.runQuery(internal.sequences.listByUniversityInternal, {
      university_id: args.universityId,
    });
    const activeSeq = (seq as any[]).find((s: any) => s.stakeholder_id === args.stakeholderId && s.status === "active");

    // 3. Select Template
    let emailData: { subject: string; body: string } | null = null;
    if (args.classification === "meeting_request" || args.classification === "positive_interest") {
        emailData = TEMPLATES.MEETING_REQUEST_ACK(st.name || st.role || "there", uni.university_name);
    } else if (args.classification === "request_info") {
        emailData = TEMPLATES.POSITIVE_INTEREST(st.name || st.role || "there", uni.university_name);
    }

    if (!emailData) return { success: true, reason: "No auto-reply needed for this category" };

    // 3. Send Email
    console.log(`[AutoReply] Sending ${args.classification} reply to ${st.email}`);
    const sendResult = await withRetry(async (): Promise<{ success: boolean; error?: string }> => {
      return await ctx.runAction(api.actions.email.sendEmail, {
        to: st.email!,
        subject: emailData!.subject,
        text: emailData!.body,
        html: (emailData as any).html ?? undefined,
      });
    });

    // 4. Record the email
    if (sendResult.success) {
        await ctx.runMutation(internal.emails.insertInternal, {
            sequence_id: activeSeq?._id as any,
            university_id: args.universityId,
            stakeholder_id: args.stakeholderId,
            subject: emailData.subject,
            body: emailData.body,
            status: "sent",
            step_number: 99, // Special step for auto-replies
            sent_at: Date.now(),
        });
    }

    return { success: sendResult.success };
  },
});
