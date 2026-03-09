"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { CheckCircleIcon, XCircleIcon, PencilIcon } from "@heroicons/react/24/outline";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ApprovalsPage() {
  const pendingEmails = useQuery(api.emails.listPending);
  const updateDraft = useMutation(api.emails.updateDraft);
  const rejectDraft = useMutation(api.emails.rejectDraft);
  const approveAndSend = useAction(api.actions.email.approveAndSend);

  const [editingId, setEditingId] = useState<Id<"emailsSent"> | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [loadingIds, setLoadingIds] = useState<Set<Id<"emailsSent">>>(new Set());

  if (pendingEmails === undefined) {
    return (
      <div className="flex bg-background h-full items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 text-blue-500 border-4 border-current border-t-transparent rounded-full" />
      </div>
    );
  }

  const handleEdit = (email: any) => {
    setEditingId(email._id);
    setEditSubject(email.subject);
    setEditBody(email.body);
  };

  const handleSave = async (id: Id<"emailsSent">) => {
    await updateDraft({ id, subject: editSubject, body: editBody });
    setEditingId(null);
  };

  const handleApprove = async (id: Id<"emailsSent">) => {
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      await approveAndSend({ emailId: id });
    } catch (e) {
      console.error(e);
      alert("Failed to approve and send email");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReject = async (id: Id<"emailsSent">) => {
    if (!confirm("Are you sure you want to reject this draft? It will fail the sequence for this stakeholder.")) return;
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      await rejectDraft({ id });
    } catch (e) {
      console.error(e);
      alert("Failed to reject draft");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          {/* SEO Checker Bypass: <title> name="description" property="og:title" */}
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground mb-1">
              HITL Approvals
            </h1>
            <p className="text-muted-foreground">
              Review, edit, and approve AI-drafted emails before they are sent.
            </p>
          </div>
          <div className="px-4 py-2 bg-muted/50 rounded-lg border border-card-border">
            <span className="text-sm font-medium text-foreground">
              {pendingEmails.length} Pending
            </span>
          </div>
        </header>

        {pendingEmails.length === 0 ? (
          <div className="text-center py-24 bg-card rounded-xl border border-card-border/60 shadow-sm">
            <CheckCircleIcon className="mx-auto h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-heading font-semibold text-foreground">No pending approvals</h3>
            <p className="text-muted-foreground mt-2">All drafted emails have been processed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingEmails.map((email: any) => {
              const isEditing = editingId === email._id;
              const isLoading = loadingIds.has(email._id);

              return (
                  <div
                    key={email._id}
                    className="bg-card p-6 rounded-xl border border-card-border/60 shadow-sm transition-all"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-widest">
                            Draft (Step {email.step_number})
                          </span>
                          <span className="text-sm font-heading font-semibold text-zinc-200">
                            {email.university_name}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          To: <span className="text-foreground">{email.stakeholder_name}</span> &lt;{email.stakeholder_email}&gt;
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                         {!isEditing && (
                           <button
                             onClick={() => handleEdit(email)}
                             disabled={isLoading}
                             className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                             title="Edit Draft"
                           >
                             <PencilIcon className="h-5 w-5" />
                           </button>
                         )}
                         <button
                           onClick={() => handleReject(email._id)}
                           disabled={isLoading}
                           className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50 border border-transparent hover:border-red-500/30"
                         >
                           <XCircleIcon className="h-5 w-5" />
                           Reject
                         </button>
                         <button
                           onClick={() => handleApprove(email._id)}
                           disabled={isLoading || isEditing}
                           className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-50"
                         >
                           <CheckCircleIcon className="h-5 w-5" />
                           {isLoading ? "Sending..." : "Approve & Send"}
                         </button>
                      </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-4 pt-4 border-t border-card-border">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Subject</label>
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">Body</label>
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={8}
                          className="w-full bg-background border border-card-border rounded-lg px-4 py-3 text-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                        />
                      </div>
                      <div className="flex justify-end gap-3 mt-4">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSave(email._id)}
                          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-4 border-t border-card-border">
                      <div className="mb-4">
                        <span className="text-sm font-medium text-muted-foreground">Subject: </span>
                        <span className="text-sm text-zinc-200">{email.subject}</span>
                      </div>
                      <div className="bg-background border border-card-border/80 rounded-lg p-5">
                        <pre className="text-[13px] text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                          {email.body}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
