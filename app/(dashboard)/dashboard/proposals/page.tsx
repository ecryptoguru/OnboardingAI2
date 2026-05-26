"use client";

import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id, Doc } from "../../../../convex/_generated/dataModel";
import {
  DocumentTextIcon,
  CalendarIcon,
  ClockIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  TrashIcon,
  XMarkIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRequireGeminiKey } from "../../../../components/ApiKeyModal";
import { useToast } from "../../../../components/Toast";

interface ProposalContent {
  executive_summary?:
    | { hook?: string; why_now?: string; vision_statement?: string }
    | string;
  problem_statement?: string;
  solution_overview?: string;
  key_benefits?: string[] | string;
  roi_summary?: string;
  next_steps?: string[] | string;
  agenda?: string[];
  overview?: string;
  summary?: string;
}

export default function ProposalsPage() {
  const { show } = useToast();
  const proposals = useQuery(api.proposals.listAll);

  // Expose all universities (or limit to enriched/meeting_booked if desired, but user wants all)
  const allUnis = useQuery(api.universities.list, {});
  const generateProposal = useAction(api.actions.proposals.generateProposal);
  const createProposal = useMutation(api.proposals.create);

  const [generating, setGenerating] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedUniId, setSelectedUniId] = useState<string>("");
  const [selectedStakeholderId, setSelectedStakeholderId] =
    useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const { withKeyCheck, keyModal: pageKeyModal } = useRequireGeminiKey();

  const allStakeholders = useQuery(
    api.stakeholders.listByUniversity,
    selectedUniId
      ? { university_id: selectedUniId as Id<"universities"> }
      : "skip",
  );

  const filteredStakeholders = useMemo(() => {
    return (
      allStakeholders?.filter(
        (s: Doc<"stakeholders">) =>
          s.email &&
          s.email.trim() !== "" &&
          s.email.trim().toLowerCase() !== "null",
      ) ?? []
    );
  }, [allStakeholders]);

  const filteredUnis = useMemo(() => {
    if (!allUnis) return [];
    if (!searchQuery) return allUnis;
    return allUnis.filter((u: Doc<"universities">) =>
      u.university_name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [allUnis, searchQuery]);

  const handleManualGenerate = async () => {
    if (!selectedUniId) return;
    setGenerating(true);
    try {
      const proposalId = await createProposal({
        university_id: selectedUniId as Id<"universities">,
        stakeholder_id: selectedStakeholderId
          ? (selectedStakeholderId as Id<"stakeholders">)
          : undefined,
        meeting_date: Date.now(),
      });
      await generateProposal({
        universityId: selectedUniId as Id<"universities">,
        proposalId,
        stakeholderId: selectedStakeholderId
          ? (selectedStakeholderId as Id<"stakeholders">)
          : undefined,
      });
      setShowManualModal(false);
      setSelectedUniId("");
      setSelectedStakeholderId("");
      setSearchQuery("");
    } catch (e) {
      show(`Failed to generate proposal: ${e}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">
            Proposals
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">
            AI-generated deal proposals — auto-created when a meeting is booked,
            or manually here
          </p>
        </div>
        <button
          type="button"
          onClick={withKeyCheck(() => setShowManualModal(true))}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm"
        >
          <DocumentTextIcon className="w-4 h-4" />
          Generate Proposal
        </button>
      </div>

      {/* Manual Generate Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <h2 className="text-xl font-bold font-heading text-foreground mb-1">
              Generate Proposal
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Select a university and an optional stakeholder to address.
            </p>

            <div className="flex-1 overflow-y-auto pr-2 space-y-5">
              {/* Step 1: Uni Selection */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  1. Select University
                </label>
                <input
                  type="text"
                  placeholder="Search university..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-background border border-card-border/80 text-foreground rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-emerald-500/50"
                />
                <select
                  size={5}
                  value={selectedUniId}
                  onChange={(e) => {
                    setSelectedUniId(e.target.value);
                    setSelectedStakeholderId(""); // reset
                  }}
                  className="w-full bg-background border border-card-border/80 text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                >
                  {filteredUnis?.map(
                    (uni: { _id: string; university_name: string }) => (
                      <option key={uni._id} value={uni._id} className="py-1">
                        {uni.university_name}
                      </option>
                    ),
                  )}
                  {filteredUnis?.length === 0 && (
                    <option disabled>No universities found...</option>
                  )}
                </select>
              </div>

              {/* Step 2: Stakeholder Selection */}
              {selectedUniId && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    2. Address To (Optional)
                  </label>
                  {!allStakeholders ? (
                    <div className="text-sm text-muted-foreground animate-pulse py-2">
                      Loading contacts...
                    </div>
                  ) : filteredStakeholders.length === 0 ? (
                    <div className="text-sm text-yellow-500 bg-yellow-500/10 px-3 py-2 rounded-lg border border-yellow-500/20">
                      No stakeholders with email found for this university.
                      Proposal will be generically addressed.
                    </div>
                  ) : (
                    <select
                      value={selectedStakeholderId}
                      onChange={(e) => setSelectedStakeholderId(e.target.value)}
                      className="w-full bg-background border border-card-border/80 text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="">
                        General Proposal (No specific addressing)
                      </option>
                      {filteredStakeholders.map(
                        (st: {
                          _id: string;
                          name?: string;
                          role?: string;
                          email?: string;
                        }) => (
                          <option key={st._id} value={st._id}>
                            {st.name || "Unspecified Contact"}{" "}
                            {st.role ? `— ${st.role}` : ""} ({st.email})
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-card-border/50">
              <button
                type="button"
                onClick={() => {
                  setShowManualModal(false);
                  setSelectedUniId("");
                  setSelectedStakeholderId("");
                  setSearchQuery("");
                }}
                disabled={generating}
                className="flex-1 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualGenerate}
                disabled={!selectedUniId || generating}
                className="flex-[2] py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Generating (approx 15s)...
                  </>
                ) : (
                  "Generate Proposal"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {!proposals ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 bg-muted/30 rounded-2xl border border-card-border/50"
            />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4 opacity-50">📄</div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            No proposals yet
          </h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Proposals are generated automatically when a Calendly meeting is
            booked, or use the Generate Proposal button above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proposals.map(
            (proposal: {
              _id: string;
              university_name?: string;
              stakeholder_details?: string;
            }) => (
              <ProposalCard
                key={proposal._id}
                proposal={
                  proposal as Doc<"proposals"> & {
                    university_name?: string;
                    stakeholder_name?: string;
                  }
                }
              />
            ),
          )}
        </div>
      )}
      {pageKeyModal}
    </div>
  );
}

function ProposalCard({
  proposal,
}: {
  proposal: Doc<"proposals"> & {
    university_name?: string;
    stakeholder_details?: string;
  };
}) {
  const { show, toastElement } = useToast();
  const removeProposal = useMutation(api.proposals.remove);
  const generateProposal = useAction(api.actions.proposals.generateProposal);

  const [regenerating, setRegenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const { withKeyCheck, keyModal: cardKeyModal } = useRequireGeminiKey();

  const allStakeholders = useQuery(api.stakeholders.listByUniversity, {
    university_id: proposal.university_id,
  });
  const validStakeholders = useMemo(
    () =>
      allStakeholders?.filter(
        (s: Doc<"stakeholders">) =>
          s.email && s.email.trim() && s.email.toLowerCase() !== "null",
      ) ?? [],
    [allStakeholders],
  );

  let content: ProposalContent | null = null;
  try {
    if (proposal.proposal_json) content = JSON.parse(proposal.proposal_json);
  } catch {}

  // Works for both old plain-string and new structured {hook, why_now, vision_statement} shapes
  const summaryText = (() => {
    if (!content) return null;
    const es = content.executive_summary;
    if (typeof es === "string" && es.trim()) return es;
    if (es && typeof es === "object")
      return (
        es.hook ||
        es.why_now ||
        es.vision_statement ||
        (Object.values(es).find((v: unknown) => typeof v === "string") as
          | string
          | undefined)
      );
    return content.agenda?.[0] || content.overview || content.summary || null;
  })();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await removeProposal({ id: proposal._id });
    } catch (e) {
      show(`Delete failed: ${e}`, "error");
      setDeleting(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await generateProposal({
        universityId: proposal.university_id,
        proposalId: proposal._id,
        ...(proposal.stakeholder_id
          ? { stakeholderId: proposal.stakeholder_id }
          : {}),
      });
    } catch (e) {
      show(`Regeneration failed: ${e}`, "error");
    } finally {
      setRegenerating(false);
    }
  };

  const isReady = proposal.status === "ready";
  const isSent = proposal.status === "sent";
  const isDraft = proposal.status === "draft";

  return (
    <>
      <div className="bg-muted border border-card-border/60 rounded-2xl overflow-hidden hover:border-card-border/80 transition-all flex flex-col shadow-sm">
        <div className="p-6 flex flex-col h-full">
          {/* Card Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="bg-blue-500/10 p-2 rounded-xl">
              <DocumentTextIcon className="w-6 h-6 text-blue-400" />
            </div>
            <span
              className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border ${
                isSent
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : isReady
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/30"
              }`}
            >
              {proposal.status}
            </span>
          </div>

          <h3 className="text-foreground font-semibold text-lg mb-1 truncate leading-tight">
            {proposal.university_name}
          </h3>

          <div className="flex items-center text-muted-foreground text-xs mb-4">
            <CalendarIcon className="w-3 h-3 mr-1" />
            {proposal.meeting_date
              ? new Date(proposal.meeting_date).toLocaleDateString()
              : "TBD"}
          </div>

          <div className="mb-4">
            <span className="inline-block text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
              Prepared For
            </span>
            <p className="text-sm font-medium text-foreground line-clamp-1">
              {proposal.stakeholder_details || "General Proposal"}
            </p>
          </div>

          {summaryText && (
            <div className="mb-4">
              <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mb-1.5">
                Executive Summary
              </p>
              <p className="text-foreground text-xs leading-relaxed line-clamp-3">
                {summaryText}
              </p>
            </div>
          )}

          {content?.key_benefits &&
            Array.isArray(content.key_benefits) &&
            content.key_benefits.length > 0 && (
              <div className="mb-4">
                <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mb-1.5">
                  Key Benefits
                </p>
                <div className="space-y-1">
                  {content.key_benefits
                    .slice(0, 2)
                    .map((b: string, i: number) => (
                      <p
                        key={i}
                        className="text-foreground text-xs leading-relaxed line-clamp-1"
                      >
                        • {b}
                      </p>
                    ))}
                  {content.key_benefits.length > 2 && (
                    <p className="text-muted-foreground text-[10px]">
                      +{content.key_benefits.length - 2} more
                    </p>
                  )}
                </div>
              </div>
            )}

          {/* Action Area */}
          <div className="flex flex-col gap-2 mt-auto pt-2">
            {confirmDelete ? (
              <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-xs text-red-400 font-medium">
                  Delete this proposal permanently?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-1.5 text-xs font-medium bg-muted text-muted-foreground rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {deleting ? (
                      <ArrowPathIcon className="w-3 h-3 animate-spin" />
                    ) : (
                      <TrashIcon className="w-3 h-3" />
                    )}
                    {deleting ? "Deleting..." : "Yes, delete"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-xl bg-muted border border-card-border/50 text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors"
                  title="Delete proposal"
                  aria-label="Delete proposal"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
                {isDraft ? (
                  <button
                    type="button"
                    disabled
                    className="flex-1 bg-muted border border-card-border/50 text-foreground/50 py-2 rounded-xl text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <ClockIcon className="w-4 h-4 animate-pulse" />{" "}
                    Generating...
                  </button>
                ) : !content ? (
                  <button
                    type="button"
                    onClick={withKeyCheck(handleRegenerate)}
                    disabled={regenerating}
                    className="flex-1 bg-amber-600/20 border border-amber-500/30 hover:bg-amber-600/30 text-amber-400 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowPathIcon
                      className={`w-4 h-4 ${regenerating ? "animate-spin" : ""}`}
                    />
                    {regenerating ? "Regenerating..." : "Regenerate Content"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowEditModal(true)}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                    {isSent ? "Preview & Resend" : "Preview & Send"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditModal && (
        <ProposalEditModal
          proposal={proposal}
          content={content}
          onClose={() => setShowEditModal(false)}
          validStakeholders={validStakeholders}
        />
      )}
      {cardKeyModal}
      {toastElement}
    </>
  );
}
/* ──────────────────────────────────────────────────────────
   Proposal Edit + Send Modal
────────────────────────────────────────────────────────── */
function AutoResizeTextareaField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      // Adjust scroll height to prevent jumping
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [value]);

  return (
    <div className="group relative -mx-4 px-4 py-2 hover:bg-muted/30 rounded-2xl transition-colors">
      <div className="flex items-center justify-between pl-1 mb-1.5 transition-opacity opacity-40 group-focus-within:opacity-100 group-hover:opacity-100">
        <label className="text-[10px] font-bold uppercase tracking-widest text-blue-500">
          {label}
        </label>
        {hint && (
          <span className="text-[10px] text-muted-foreground/60 invisible sm:visible">
            {hint}
          </span>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-transparent focus:outline-none focus:border-transparent focus:ring-0 p-0 m-0 text-sm text-foreground leading-relaxed resize-none overflow-hidden transition-all placeholder:text-muted-foreground/30"
        rows={1}
      />
    </div>
  );
}

function ProposalEditModal({
  proposal,
  content: initialContent,
  onClose,
  validStakeholders,
}: {
  proposal: Doc<"proposals"> & { university_name?: string };
  content: ProposalContent | null;
  onClose: () => void;
  validStakeholders: Doc<"stakeholders">[];
}) {
  const { show, toastElement } = useToast();
  const updateProposal = useMutation(api.proposals.update);
  const emailProposal = useAction(api.actions.proposals.emailProposal);

  // Editable fields — initialised from stored JSON
  const [hook, setHook] = useState<string>(() => {
    const es = initialContent?.executive_summary;
    return typeof es === "string" ? es : es?.hook || "";
  });
  const [whyNow, setWhyNow] = useState<string>(
    (typeof initialContent?.executive_summary === "object" &&
      initialContent?.executive_summary?.why_now) ||
      "",
  );
  const [vision, setVision] = useState<string>(
    (typeof initialContent?.executive_summary === "object" &&
      initialContent?.executive_summary?.vision_statement) ||
      "",
  );
  const [problem, setProblem] = useState<string>(
    initialContent?.problem_statement || "",
  );
  const [solution, setSolution] = useState<string>(
    initialContent?.solution_overview || "",
  );
  const [benefits, setBenefits] = useState<string>(
    Array.isArray(initialContent?.key_benefits)
      ? initialContent.key_benefits.join("\n")
      : initialContent?.key_benefits || "",
  );
  const [roi, setRoi] = useState<string>(initialContent?.roi_summary || "");
  const [nextSteps, setNextSteps] = useState<string>(
    Array.isArray(initialContent?.next_steps)
      ? initialContent.next_steps.join("\n")
      : initialContent?.next_steps || "",
  );

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [ccEmailsStr, setCcEmailsStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);

  const buildUpdatedJson = () => {
    const base = initialContent || {};
    return JSON.stringify({
      ...base,
      executive_summary: { hook, why_now: whyNow, vision_statement: vision },
      problem_statement: problem,
      solution_overview: solution,
      key_benefits: benefits
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      roi_summary: roi,
      next_steps: nextSteps
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProposal({
        id: proposal._id,
        proposal_json: buildUpdatedJson(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      show(`Save failed: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (selectedEmails.length === 0 && !ccEmailsStr.trim()) {
      show("Select at least one recipient or provide a CC.", "error");
      return;
    }
    setSending(true);
    try {
      // Save edits first, then email
      await updateProposal({
        id: proposal._id,
        proposal_json: buildUpdatedJson(),
      });
      const ccList = ccEmailsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const result = (await emailProposal({
        proposalId: proposal._id,
        toEmails: selectedEmails,
        ccEmails: ccList.length > 0 ? ccList : undefined,
      })) as { success?: boolean; error?: string };
      if (!result.success) show(`Send failed: ${result.error}`, "error");
      else onClose();
    } catch (e) {
      show(`Send failed: ${e}`, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Main Modal Container */}
      <div className="relative w-full max-w-6xl h-full max-h-[90vh] bg-background border border-card-border/80 rounded-2xl flex flex-col md:flex-row shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Left Column: Document Editor */}
        <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden relative">
          {/* Header Fade Overlay */}
          <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-background/50 to-transparent z-10 pointer-events-none" />

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-10 hide-scrollbar z-0">
            {/* The Document "Page" */}
            <div className="max-w-3xl mx-auto bg-card border border-card-border/80 shadow-sm rounded-2xl p-6 sm:p-10 lg:p-14 space-y-2">
              <div className="mb-8 border-b border-card-border/50 pb-6">
                <h2 className="text-3xl font-heading font-bold text-foreground mb-2">
                  {proposal.university_name}
                </h2>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Proposal Draft
                </p>
              </div>

              <AutoResizeTextareaField
                label="Executive Hook"
                value={hook}
                onChange={setHook}
                hint="Opening line to create immediate curiosity."
              />
              <AutoResizeTextareaField
                label="Why Now"
                value={whyNow}
                onChange={setWhyNow}
                hint="Urgency & timing for acting now."
              />
              <AutoResizeTextareaField
                label="Vision Statement"
                value={vision}
                onChange={setVision}
                hint="The future state you're helping them achieve."
              />
              <AutoResizeTextareaField
                label="The Challenge"
                value={problem}
                onChange={setProblem}
                hint="The problem they're currently facing."
              />
              <AutoResizeTextareaField
                label="Our Solution"
                value={solution}
                onChange={setSolution}
                hint="How Fretbox specifically solves their challenge."
              />
              <AutoResizeTextareaField
                label="Key Benefits"
                value={benefits}
                onChange={setBenefits}
                hint="One benefit per line."
              />
              <AutoResizeTextareaField
                label="Expected ROI"
                value={roi}
                onChange={setRoi}
                hint="Quantified or qualified outcome."
              />
              <AutoResizeTextareaField
                label="Next Steps"
                value={nextSteps}
                onChange={setNextSteps}
                hint="One step per line."
              />
            </div>
          </div>
        </div>

        {/* Right Column: Configuration & Actions */}
        <div className="w-full md:w-80 lg:w-96 bg-card border-t md:border-t-0 md:border-l border-card-border/80 flex flex-col flex-shrink-0 z-20 shadow-xl">
          <div className="px-6 py-5 border-b border-card-border/60 flex items-center justify-between">
            <h3 className="font-semibold text-foreground tracking-tight">
              Send Proposal
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close send modal"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Actions / Save State */}
            <div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-xl transition-colors border border-blue-500/20"
              >
                {saving ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <DocumentTextIcon className="w-4 h-4" />
                )}
                {saved
                  ? "✓ Saved to Drafts"
                  : saving
                    ? "Saving..."
                    : "Save Draft"}
              </button>
            </div>

            {/* Recipients */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Recipients
              </h4>

              {validStakeholders.length === 0 ? (
                <p className="text-xs text-yellow-500 bg-yellow-500/10 px-3 py-2 rounded-lg border border-yellow-500/20">
                  No stakeholders with email addresses found. Provide CC emails
                  below.
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {validStakeholders.map((st) => (
                    <label
                      key={st._id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-background border border-card-border/50 cursor-pointer hover:border-emerald-500/30 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmails.includes(st.email!)}
                        onChange={(e) => {
                          if (e.target.checked)
                            setSelectedEmails((prev) => [...prev, st.email!]);
                          else
                            setSelectedEmails((prev) =>
                              prev.filter((em) => em !== st.email!),
                            );
                        }}
                        className="accent-emerald-500 w-4 h-4 mt-0.5 rounded cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {st.name || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {st.role} • {st.email}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* CC */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                CC (Optional)
              </h4>
              <textarea
                rows={2}
                placeholder="sales@fretbox.in, support@fretbox.in"
                value={ccEmailsStr}
                onChange={(e) => setCcEmailsStr(e.target.value)}
                className="w-full bg-background border border-card-border/80 text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 resize-none hover:border-card-border/100 transition-colors"
              />
            </div>
          </div>

          <div className="p-6 border-t border-card-border/60 bg-card">
            <button
              type="button"
              onClick={handleSend}
              disabled={
                sending || (selectedEmails.length === 0 && !ccEmailsStr.trim())
              }
              className="w-full py-4 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {sending ? (
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-5 h-5" />
              )}
              {sending ? "Sending..." : `Send Proposal`}
            </button>
          </div>
        </div>
      </div>
      {toastElement}
    </div>
  );
}
