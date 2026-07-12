"use client";

import { useState } from "react";
import { KeyIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { PasswordInput, TestResultAlert, StatusBadge } from "./components";

type IconColor =
  | "bg-blue-500/10 border border-blue-500/20 text-blue-500"
  | "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
  | "bg-orange-500/10 border border-orange-500/20 text-orange-500"
  | "bg-slate-500/10 border border-slate-500/20 text-slate-400";

interface ApiKeySectionProps {
  title: string;
  description: string;
  iconColor: IconColor;
  ringColor: "blue" | "emerald" | "orange" | "slate" | "red";
  isConfigured: boolean | undefined;
  placeholderConfigured: string;
  placeholderEmpty: string;
  testResult: { success?: boolean; error?: string; message?: string } | null;
  isSaving: boolean;
  isTestingNew: boolean;
  isTestingStored: boolean;
  isRemoving: boolean;
  showKey: boolean;
  onSave: (key: string) => Promise<void>;
  onTestNew: (key: string) => Promise<void>;
  onTestStored: () => Promise<void>;
  onRemove: () => Promise<void>;
  onToggleShow: () => void;
  successMessage: string;
  removeLabel?: string;
}

export function ApiKeySection({
  title,
  description,
  iconColor,
  ringColor,
  isConfigured,
  placeholderConfigured,
  placeholderEmpty,
  testResult,
  isSaving,
  isTestingNew,
  isTestingStored,
  isRemoving,
  showKey,
  onSave,
  onTestNew,
  onTestStored,
  onRemove,
  onToggleShow,
  successMessage,
  removeLabel = "Disconnect",
}: ApiKeySectionProps) {
  const [apiKey, setApiKey] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    await onSave(apiKey);
    setApiKey("");
  };

  const handleTestNew = async () => {
    if (!apiKey) return;
    await onTestNew(apiKey);
  };

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-6 border-b border-card-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 ${iconColor} rounded-xl border shadow-inner`}>
            <KeyIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between bg-background border border-card-border p-4 rounded-lg">
          <span className="text-sm font-medium text-foreground">
            Current Integration Status
          </span>
          <StatusBadge
            isConfigured={isConfigured}
            configuredLabel="Key Actively Configured"
            unconfiguredLabel="Not Configured"
          />
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2.5">
            <label className="text-sm font-semibold text-foreground">
              API Key
            </label>
            <PasswordInput
              id={`${title}-apiKey`}
              value={apiKey}
              onChange={setApiKey}
              placeholder={isConfigured ? placeholderConfigured : placeholderEmpty}
              show={showKey}
              onToggleShow={onToggleShow}
              ringColor={ringColor}
            />
            <p className="text-[13px] text-muted-foreground">
              Your key will be securely stored in the database. Leave blank to
              keep the current key.
            </p>
          </div>

          <TestResultAlert
            result={testResult}
            successMessage={successMessage}
          />

          <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-card-border">
            <button
              type="button"
              onClick={handleTestNew}
              disabled={!apiKey || isTestingNew || isSaving}
              className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
            >
              {isTestingNew ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                "Test New Key"
              )}
            </button>

            <button
              type="button"
              onClick={onTestStored}
              disabled={isTestingStored || isSaving || isTestingNew || !isConfigured}
              className="px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 text-sm font-semibold rounded-lg transition-all border border-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
            >
              {isTestingStored ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                "Test Current"
              )}
            </button>

            <button
              type="submit"
              disabled={!apiKey || isSaving || isTestingNew || isTestingStored}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
            >
              {isSaving ? "Saving..." : "Save Key"}
            </button>

            <button
              type="button"
              onClick={onRemove}
              disabled={isRemoving || !isConfigured}
              className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
            >
              {isRemoving ? "Disconnecting..." : removeLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
