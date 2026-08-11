"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Doc, Id } from "../convex/_generated/dataModel";
import { useToast } from "./Toast";
import {
  XMarkIcon,
  DocumentTextIcon,
  PaperClipIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";

interface DocumentMailerModalProps {
  universities: Doc<"universities">[];
  onClose: () => void;
}

interface UploadedFile {
  storageId: Id<"_storage">;
  filename: string;
  mime_type: string;
}

type RecipientMode = "stakeholder" | "custom";

interface RecipientConfig {
  mode: RecipientMode;
  stakeholderId?: Id<"stakeholders">;
  customEmail: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function DocumentMailerModal({
  universities,
  onClose,
}: DocumentMailerModalProps) {
  const { show, toastElement } = useToast();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const parseDocx = useAction(api.actions.document.parseDocx);
  const createDocumentDrafts = useAction(api.actions.document.createDocumentDrafts);

  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [bodyFile, setBodyFile] = useState<UploadedFile | null>(null);
  const [isParsingBody, setIsParsingBody] = useState(false);
  const [attachBodyDoc, setAttachBodyDoc] = useState(true);

  const [additionalAttachments, setAdditionalAttachments] = useState<
    UploadedFile[]
  >([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  const [selectedUniIds, setSelectedUniIds] = useState<
    Set<Id<"universities">>
  >(new Set());
  const [recipientConfig, setRecipientConfig] = useState<
    Record<Id<"universities">, RecipientConfig>
  >({});
  const [search, setSearch] = useState("");

  const [isCreating, setIsCreating] = useState(false);

  const bodyInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const selectedIds = useMemo(
    () => Array.from(selectedUniIds),
    [selectedUniIds],
  );

  const stakeholdersByUni = useQuery(
    api.stakeholders.listByUniversities,
    selectedIds.length > 0 ? { university_ids: selectedIds } : "skip",
  );

  const filteredUniversities = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return universities;
    return universities.filter((u) =>
      u.university_name.toLowerCase().includes(term),
    );
  }, [universities, search]);

  // Pre-populate recipient defaults when stakeholders load or selection changes.
  useEffect(() => {
    if (!stakeholdersByUni) return;
    setRecipientConfig((prev) => {
      const next = { ...prev };
      for (const uniId of selectedUniIds) {
        if (next[uniId]) continue;
        const sts = stakeholdersByUni[uniId] || [];
        const st =
          sts.find((s) => s.is_primary && s.email) || sts.find((s) => s.email);
        if (st) {
          next[uniId] = { mode: "stakeholder", stakeholderId: st._id, customEmail: "" };
        } else {
          next[uniId] = { mode: "custom", customEmail: "" };
        }
      }
      // Drop universities that are no longer selected.
      for (const key of Object.keys(next)) {
        if (!selectedUniIds.has(key as Id<"universities">)) {
          delete next[key as Id<"universities">];
        }
      }
      return next;
    });
  }, [selectedUniIds, stakeholdersByUni]);

  async function uploadFile(file: File): Promise<UploadedFile> {
    const postUrl = await generateUploadUrl();
    const response = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    const { storageId } = await response.json();
    return {
      storageId: storageId as Id<"_storage">,
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
    };
  }

  async function handleBodyFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingBody(true);
    try {
      const uploaded = await uploadFile(file);
      const result = await parseDocx({ storageId: uploaded.storageId });
      setBodyFile(uploaded);
      setBodyText(result.text);
      if (result.messages.length > 0) {
        console.warn("docx parse warnings:", result.messages);
      }
    } catch (err) {
      console.error(err);
      show(
        err instanceof Error ? err.message : "Failed to parse document",
        "error",
      );
    } finally {
      setIsParsingBody(false);
      if (bodyInputRef.current) bodyInputRef.current.value = "";
    }
  }

  async function handleAttachmentFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingAttachment(true);
    try {
      const uploads = await Promise.all(Array.from(files).map(uploadFile));
      setAdditionalAttachments((prev) => [...prev, ...uploads]);
    } catch (err) {
      console.error(err);
      show(
        err instanceof Error ? err.message : "Failed to upload attachment(s)",
        "error",
      );
    } finally {
      setIsUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  function removeAttachment(index: number) {
    setAdditionalAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleUniversity(uniId: Id<"universities">) {
    setSelectedUniIds((prev) => {
      const next = new Set(prev);
      if (next.has(uniId)) {
        next.delete(uniId);
      } else {
        next.add(uniId);
      }
      return next;
    });
  }

  function setMode(uniId: Id<"universities">, mode: RecipientMode) {
    setRecipientConfig((prev) => {
      const current = prev[uniId] || {
        mode: "custom",
        customEmail: "",
      };
      return {
        ...prev,
        [uniId]: { ...current, mode, stakeholderId: undefined, customEmail: "" },
      };
    });
  }

  function setStakeholder(
    uniId: Id<"universities">,
    stakeholderId: Id<"stakeholders">,
  ) {
    setRecipientConfig((prev) => ({
      ...prev,
      [uniId]: { mode: "stakeholder", stakeholderId, customEmail: "" },
    }));
  }

  function setCustomEmail(uniId: Id<"universities">, email: string) {
    setRecipientConfig((prev) => ({
      ...prev,
      [uniId]: { ...prev[uniId], mode: "custom", customEmail: email },
    }));
  }

  function resolveRecipientConfig(
    uniId: Id<"universities">,
  ): RecipientConfig {
    const fromState = recipientConfig[uniId];
    if (fromState) return fromState;
    const sts = stakeholdersByUni?.[uniId] || [];
    const st =
      sts.find((s) => s.is_primary && s.email) || sts.find((s) => s.email);
    if (st) return { mode: "stakeholder", stakeholderId: st._id, customEmail: "" };
    return { mode: "custom", customEmail: "" };
  }

  async function handleSubmit() {
    if (!subject.trim()) {
      show("Subject is required", "error");
      return;
    }
    if (!bodyText.trim()) {
      show("Email body is required", "error");
      return;
    }
    if (selectedIds.length === 0) {
      show("Select at least one university", "error");
      return;
    }

    const recipients: {
      university_id: Id<"universities">;
      stakeholder_id?: Id<"stakeholders">;
      custom_email?: string;
    }[] = [];

    for (const uniId of selectedIds) {
      const cfg = resolveRecipientConfig(uniId);
      if (cfg.mode === "stakeholder" && cfg.stakeholderId) {
        recipients.push({
          university_id: uniId,
          stakeholder_id: cfg.stakeholderId,
        });
      } else if (cfg.mode === "custom" && cfg.customEmail.trim()) {
        if (!EMAIL_REGEX.test(cfg.customEmail.trim())) {
          show(`Invalid email for one of the recipients`, "error");
          return;
        }
        recipients.push({
          university_id: uniId,
          custom_email: cfg.customEmail.trim(),
        });
      } else {
        show("Every selected university needs a stakeholder or custom email", "error");
        return;
      }
    }

    const attachments: {
      storage_id: Id<"_storage">;
      filename: string;
      mime_type: string;
    }[] = additionalAttachments.map((a) => ({
      storage_id: a.storageId,
      filename: a.filename,
      mime_type: a.mime_type,
    }));
    if (attachBodyDoc && bodyFile) {
      attachments.unshift({
        storage_id: bodyFile.storageId,
        filename: bodyFile.filename,
        mime_type: bodyFile.mime_type,
      });
    }

    setIsCreating(true);
    try {
      await createDocumentDrafts({
        subject: subject.trim(),
        body: bodyText,
        htmlBody: undefined,
        bodyStorageId: bodyFile?.storageId,
        attachments: attachments.length > 0 ? attachments : undefined,
        recipients,
      });
      show(`Created ${recipients.length} draft(s) for approval`, "success");
      onClose();
    } catch (err) {
      console.error(err);
      show(
        err instanceof Error ? err.message : "Failed to create email drafts",
        "error",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-card border border-card-border rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b border-card-border bg-card/95 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-heading font-bold text-foreground">
              Document Mailer
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Partnership proposal for Fretbox hostel management"
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Body document */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Body document (.docx)
            </label>
            <input
              ref={bodyInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleBodyFileChange}
              className="hidden"
            />
            {!bodyFile ? (
              <button
                type="button"
                onClick={() => bodyInputRef.current?.click()}
                disabled={isParsingBody}
                className="w-full py-8 border-2 border-dashed border-card-border hover:border-blue-500/50 rounded-xl bg-background text-muted-foreground text-sm font-medium transition-colors flex flex-col items-center justify-center gap-2"
              >
                <DocumentTextIcon className="h-6 w-6" />
                {isParsingBody ? "Parsing document…" : "Click to upload .docx"}
              </button>
            ) : (
              <div className="p-3 bg-background border border-card-border rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <DocumentTextIcon className="h-4 w-4 text-blue-400" />
                    <span className="font-medium">{bodyFile.filename}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBodyFile(null);
                      setBodyText("");
                      setAttachBodyDoc(true);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachBodyDoc}
                    onChange={(e) => setAttachBodyDoc(e.target.checked)}
                    className="rounded border-card-border bg-background text-blue-500 focus:ring-0"
                  />
                  Also attach this .docx to the email
                </label>
              </div>
            )}

            {bodyFile && (
              <div className="mt-3">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Extracted email body (editable)
                </label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            )}
          </div>

          {/* Additional attachments */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Additional attachments
            </label>
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleAttachmentFileChange}
              className="hidden"
            />
            {additionalAttachments.length === 0 ? (
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={isUploadingAttachment}
                className="w-full py-4 border-2 border-dashed border-card-border hover:border-blue-500/50 rounded-xl bg-background text-muted-foreground text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <PaperClipIcon className="h-4 w-4" />
                {isUploadingAttachment ? "Uploading…" : "Add attachments"}
              </button>
            ) : (
              <div className="space-y-2">
                {additionalAttachments.map((file, i) => (
                  <div
                    key={`${file.storageId}-${i}`}
                    className="flex items-center justify-between p-3 bg-background border border-card-border rounded-xl"
                  >
                    <div className="flex items-center gap-2 text-sm text-foreground min-w-0">
                      <PaperClipIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">
                        {file.filename}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={isUploadingAttachment}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  + Add more attachments
                </button>
              </div>
            )}
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Recipients
            </label>

            {/* Search */}
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search universities…"
                className="w-full pl-9 pr-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* University list */}
            <div className="border border-card-border rounded-xl bg-background max-h-48 overflow-y-auto p-2 space-y-1 mb-4">
              {filteredUniversities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No universities match your search.
                </p>
              ) : (
                filteredUniversities.map((uni) => {
                  const checked = selectedUniIds.has(uni._id);
                  return (
                    <label
                      key={uni._id}
                      className={classNames(
                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                        checked
                          ? "bg-blue-500/10 border border-blue-500/20"
                          : "hover:bg-muted border border-transparent",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUniversity(uni._id)}
                        className="rounded border-card-border bg-background text-blue-500 focus:ring-0"
                      />
                      <span className="text-sm text-foreground font-medium">
                        {uni.university_name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {[uni.city, uni.state].filter(Boolean).join(", ") || "—"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {/* Recipient rows */}
            {selectedIds.length > 0 && (
              <div className="space-y-3">
                {selectedIds.map((uniId) => {
                  const uni = universities.find((u) => u._id === uniId)!;
                  const cfg = resolveRecipientConfig(uniId);
                  const sts = stakeholdersByUni?.[uniId] || [];
                  return (
                    <div
                      key={uniId}
                      className="p-3 border border-card-border rounded-xl bg-background"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-foreground">
                          {uni.university_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleUniversity(uniId)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={
                            cfg.mode === "stakeholder" && cfg.stakeholderId
                              ? cfg.stakeholderId
                              : "custom"
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === "custom") {
                              setMode(uniId, "custom");
                            } else {
                              setStakeholder(uniId, value as Id<"stakeholders">);
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-muted border border-card-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
                        >
                          <option value="custom">Custom email…</option>
                          {sts.map((st) => (
                            <option key={st._id} value={st._id}>
                              {st.name || st.role || "Unnamed"} ({st.email || "no email"})
                            </option>
                          ))}
                        </select>

                        {cfg.mode === "custom" ? (
                          <div className="flex-1 relative">
                            <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                              type="email"
                              value={cfg.customEmail}
                              onChange={(e) =>
                                setCustomEmail(uniId, e.target.value)
                              }
                              placeholder="recipient@university.edu"
                              className="w-full pl-9 pr-3 py-2 bg-muted border border-card-border rounded-lg text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        ) : (
                          <div className="flex-1 px-3 py-2 text-sm text-muted-foreground bg-muted/50 border border-card-border rounded-lg truncate">
                            {sts.find((s) => s._id === cfg.stakeholderId)
                              ?.email || "Select a stakeholder"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-20 flex items-center justify-between px-6 py-4 border-t border-card-border bg-card/95 backdrop-blur-md">
          <div className="text-xs text-muted-foreground">
            {selectedIds.length} university
            {selectedIds.length === 1 ? "" : "ies"} selected
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                isCreating || isParsingBody || isUploadingAttachment || !bodyFile
              }
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-all shadow-sm"
            >
              {isCreating
                ? "Creating drafts…"
                : `Create ${selectedIds.length || ""} draft${
                    selectedIds.length === 1 ? "" : "s"
                  }`}
            </button>
          </div>
        </div>
      </div>
      {toastElement}
    </div>
  );
}
