"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  CheckBadgeIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import { Id, Doc } from "../../../../convex/_generated/dataModel";
import { useToast } from "../../../../components/Toast";

const STEP_LABELS: Record<number, string> = {
  1: "Initial Outreach",
  2: "Follow-up 1",
  3: "Value-Add Follow-up",
  4: "Break-up / Final",
  99: "Auto-Reply",
};

export default function ApprovalsPage() {
  const { show, toastElement } = useToast();
  const pendingEmails = useQuery(api.emails.listPending) as
    | (Doc<"emailsSent"> & {
        university_name?: string;
        stakeholder_name?: string;
        stakeholder_email?: string;
      })[]
    | undefined;
  const updateDraft = useMutation(api.emails.updateDraft);
  const rejectDraft = useMutation(api.emails.rejectDraft);
  const approveAndSend = useAction(api.actions.email.approveAndSend);

  const [editingId, setEditingId] = useState<Id<"emailsSent"> | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [loadingIds, setLoadingIds] = useState<Set<Id<"emailsSent">>>(
    new Set(),
  );
  const [bulkApproving, setBulkApproving] = useState(false);

  if (pendingEmails === undefined) {
    return (
      <div className="flex bg-background h-full items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 text-blue-500 border-4 border-current border-t-transparent rounded-full" />
      </div>
    );
  }

  const addLoading = (id: Id<"emailsSent">) =>
    setLoadingIds((prev) => new Set(prev).add(id));
  const removeLoading = (id: Id<"emailsSent">) =>
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const handleEdit = (email: Doc<"emailsSent">) => {
    setEditingId(email._id);
    setEditSubject(email.subject);
    setEditBody(email.body);
  };

  const handleSave = async (id: Id<"emailsSent">) => {
    await updateDraft({ id, subject: editSubject, body: editBody });
    setEditingId(null);
  };

  const handleApprove = async (id: Id<"emailsSent">) => {
    addLoading(id);
    try {
      await approveAndSend({ emailId: id });
    } catch (e) {
      console.error(e);
      show("Failed to approve and send email", "error");
    } finally {
      removeLoading(id);
    }
  };

  const handleReject = async (id: Id<"emailsSent">) => {
    if (
      !confirm(
        "Reject this draft? The sequence will be paused for this stakeholder.",
      )
    )
      return;
    addLoading(id);
    try {
      await rejectDraft({ id });
    } catch (e) {
      console.error(e);
      show("Failed to reject draft", "error");
    } finally {
      removeLoading(id);
    }
  };

  const handleBulkApprove = async () => {
    if (
      !confirm(
        `Approve and send ALL ${pendingEmails.length} pending emails now?`,
      )
    )
      return;
    setBulkApproving(true);
    for (const email of pendingEmails) {
      try {
        await approveAndSend({ emailId: email._id });
      } catch (e) {
        console.error("Failed to approve email", email._id, e);
      }
    }
    setBulkApproving(false);
  };

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground mb-1">
              HITL Approvals
            </h1>
            <p className="text-muted-foreground text-sm">
              Review, edit, and approve AI-drafted outreach emails before
              sending.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-muted/50 rounded-lg border border-card-border">
              <span className="text-sm font-bold text-amber-400">
                {pendingEmails.length}
              </span>
              <span className="text-sm text-muted-foreground ml-1">
                Pending
              </span>
            </div>
            {pendingEmails.length > 1 && (
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkApproving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold rounded-lg transition-all shadow-sm"
              >
                <CheckBadgeIcon className="h-5 w-5" />
                {bulkApproving
                  ? "Sending all..."
                  : `Approve All (${pendingEmails.length})`}
              </button>
            )}
          </div>
        </header>

        {/* Empty state */}
        {pendingEmails.length === 0 ? (
          <div className="text-center py-28 bg-card rounded-2xl border border-card-border/60 shadow-sm">
            <div className="text-5xl mb-4">🎉</div>
            <h3 className="text-lg font-heading font-semibold text-foreground">
              Inbox Zero!
            </h3>
            <p className="text-muted-foreground mt-2 text-sm">
              All drafted emails have been reviewed. The AI will draft new
              emails as sequences progress.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingEmails.map((email) => {
              const isEditing = editingId === email._id;
              const isLoading = loadingIds.has(email._id);

              return (
                <div
                  key={email._id}
                  className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden transition-all"
                >
                  {/* Card header */}
                  <div className="px-6 py-4 bg-background/40 border-b border-card-border/50 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Step indicator */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                          <span className="text-amber-400 text-xs font-bold">
                            {email.step_number}
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                            {STEP_LABELS[email.step_number] ??
                              `Step ${email.step_number}`}
                          </p>
                        </div>
                      </div>
                      <div className="w-px h-8 bg-card-border/60" />
                      {/* University + stakeholder */}
                      <div className="min-w-0">
                        <h3 className="text-sm font-heading font-semibold text-foreground truncate">
                          {email.university_name}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">
                          To: {email.stakeholder_name ?? "—"} ·{" "}
                          {email.stakeholder_email ?? email.recipient_email ?? "No email"}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => handleEdit(email)}
                          disabled={isLoading}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                          title="Edit Draft"
                          aria-label="Edit Draft"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleReject(email._id)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 hover:text-white hover:bg-red-500/15 rounded-lg transition-colors disabled:opacity-50 border border-transparent hover:border-red-500/25"
                      >
                        <XCircleIcon className="h-4 w-4" />
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(email._id)}
                        disabled={isLoading || isEditing}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50"
                      >
                        <CheckCircleIcon className="h-4 w-4" />
                        {isLoading ? "Sending..." : "Approve & Send →"}
                      </button>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-6 py-5">
                    {isEditing ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Subject
                          </label>
                          <input
                            type="text"
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            className="w-full bg-background border border-card-border/80 rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Body
                          </label>
                          <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={10}
                            className="w-full bg-background border border-card-border/80 rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono resize-none"
                          />
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSave(email._id)}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-2 mb-4">
                          <span className="text-xs text-muted-foreground font-medium">
                            Subject:
                          </span>
                          <span className="text-sm text-foreground font-semibold">
                            {email.subject}
                          </span>
                        </div>
                        {/* Styled email preview */}
                        <div className="bg-background border border-card-border/60 rounded-xl overflow-hidden">
                          <div className="px-5 py-3 bg-muted/40 border-b border-card-border/40">
                            <span className="text-xs text-muted-foreground">
                              Email Preview
                            </span>
                          </div>
                          <div className="px-6 py-5">
                            {email.body
                              .split("\n")
                              .map((line: string, i: number) =>
                                line.trim() === "" ? (
                                  <div key={i} className="h-3" />
                                ) : line.startsWith("-") ? (
                                  <div
                                    key={i}
                                    className="flex items-start gap-2 my-1"
                                  >
                                    <span className="text-blue-400 mt-0.5 shrink-0">
                                      •
                                    </span>
                                    <p className="text-sm text-foreground leading-relaxed">
                                      {line.slice(1).trim()}
                                    </p>
                                  </div>
                                ) : (
                                  <p
                                    key={i}
                                    className={`text-sm text-foreground leading-relaxed ${i === 0 ? "font-medium" : ""}`}
                                  >
                                    {line}
                                  </p>
                                ),
                              )}
                          </div>
                        </div>
                        {email.attachments && email.attachments.length > 0 && (
                          <div className="mt-4">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-2">
                              <PaperClipIcon className="h-3.5 w-3.5" />
                              Attachments ({email.attachments.length})
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {email.attachments.map((a, i) => (
                                <span
                                  key={`${a.storage_id}-${i}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-foreground bg-muted border border-card-border/60 rounded-lg"
                                >
                                  <PaperClipIcon className="h-3 w-3 text-muted-foreground" />
                                  {a.filename}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {toastElement}
    </div>
  );
}
