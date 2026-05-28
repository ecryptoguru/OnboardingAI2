"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { TEMPLATES } from "../lib/emailTemplates";
import { withRetry } from "../lib/utils";

// Narrow interfaces for internal query results (fallback when generated types are stale)
interface SequenceDoc {
  _id: string;
  stakeholder_id: string;
  status: string;
}

interface ProposalDoc {
  _id: string;
  stakeholder_id?: string;
  created_at?: number;
  meet_link?: string;
}

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

    if (!uni || !st || !st.email)
      return { success: false, reason: "Missing data" };

    // 2. Fetch active sequence (optional)
    const seq = await ctx.runQuery(
      internal.sequences.listByUniversityInternal,
      {
        university_id: args.universityId,
      },
    );
    const activeSeq = (Array.isArray(seq) ? (seq as SequenceDoc[]) : []).find(
      (s) => s.stakeholder_id === args.stakeholderId && s.status === "active",
    );

    // 3. Look up latest proposal for Meet link (used when classification is meeting_request)
    let meetLink: string | undefined;
    if (args.classification === "meeting_request") {
      const proposals = await ctx.runQuery(
        internal.proposals.listByUniversityInternal,
        {
          university_id: args.universityId,
        },
      );
      const latestProposal = (
        Array.isArray(proposals) ? (proposals as ProposalDoc[]) : []
      )
        .filter(
          (p) => p.stakeholder_id === args.stakeholderId || !p.stakeholder_id,
        )
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
      meetLink = latestProposal?.meet_link;
    }

    // 4. Select Template
    let emailData: { subject: string; body: string; html?: string } | null =
      null;
    if (
      args.classification === "meeting_request" ||
      args.classification === "positive_interest"
    ) {
      emailData = TEMPLATES.MEETING_REQUEST_ACK(
        st.name || st.role || "there",
        uni.university_name,
        meetLink,
      );
    } else if (args.classification === "request_info") {
      emailData = TEMPLATES.POSITIVE_INTEREST(
        st.name || st.role || "there",
        uni.university_name,
        meetLink,
      );
    }

    if (!emailData)
      return {
        success: true,
        reason: "No auto-reply needed for this category",
      };

    // 5. Build threading headers for proper email threading
    // Look up the most recent sent email in the active sequence so In-Reply-To
    // matches the actual Message-ID that was delivered (<fretbox-{emailId}@reply.fretbox.in>).
    let parentEmailId: string | undefined;
    if (activeSeq) {
      const seqEmails = await ctx.runQuery(
        internal.emails.listBySequenceInternal,
        {
          sequence_id: activeSeq._id as unknown as Id<"outreachSequences">,
        },
      );
      const originalEmail = (seqEmails as { _id: string; step_number: number; status: string }[])
        .filter((e) => e.step_number !== 99 && e.status === "sent")
        .sort((a, b) => b.step_number - a.step_number)[0];
      if (originalEmail) {
        parentEmailId = `<fretbox-${originalEmail._id}@reply.fretbox.in>`;
      }
    }

    // 6. Send Email
    console.log(
      `[AutoReply] Sending ${args.classification} reply to ${st.email}`,
    );
    const sendResult = await withRetry(
      async (): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
      }> => {
        return await ctx.runAction(api.actions.email.sendEmail, {
          to: st.email!,
          subject: emailData!.subject,
          text: emailData!.body,
          html: emailData.html ?? undefined,
          ...(parentEmailId
            ? {
                messageIdHeader: `<fretbox-autoreply-${Date.now()}@reply.fretbox.in>`,
                inReplyTo: parentEmailId,
                references: parentEmailId,
              }
            : {}),
        });
      },
    );

    // 6. Record the email with SendGrid message ID for tracking
    if (sendResult.success) {
      const normalizedMessageId = sendResult.messageId?.split(".")[0];
      await ctx.runMutation(internal.emails.insertInternal, {
        sequence_id: activeSeq?._id as unknown as Id<"outreachSequences">,
        university_id: args.universityId,
        stakeholder_id: args.stakeholderId,
        subject: emailData.subject,
        body: emailData.body,
        html_body: emailData.html,
        status: "sent",
        sendgrid_message_id: normalizedMessageId,
        step_number: 99, // Special step for auto-replies
        sent_at: Date.now(),
      });
    }

    return { success: sendResult.success };
  },
});
