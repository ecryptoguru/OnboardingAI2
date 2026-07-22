"use client";

import { EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  show: boolean;
  onToggleShow: () => void;
  ringColor?: string;
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  show,
  onToggleShow,
  ringColor = "blue",
}: PasswordInputProps) {
  const ringClass = {
    blue: "focus:ring-blue-500/50 focus:border-blue-500",
    emerald: "focus:ring-emerald-500/50 focus:border-emerald-500",
    orange: "focus:ring-orange-500/50 focus:border-orange-500",
    slate: "focus:ring-slate-500/50 focus:border-slate-500",
    red: "focus:ring-red-500/50 focus:border-red-500",
  }[ringColor] || "focus:ring-blue-500/50 focus:border-blue-500";

  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex h-11 w-full rounded-lg border border-card-border bg-background px-4 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none ${ringClass} transition-all shadow-sm`}
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? (
          <EyeSlashIcon className="w-4 h-4" />
        ) : (
          <EyeIcon className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

interface TestResult {
  success?: boolean;
  error?: string;
  message?: string;
}

/** Strip Convex internal noise from thrown mutation errors. */
export function cleanConvexError(raw: string | undefined): string {
  if (!raw) return "An unexpected error occurred.";
  // Remove stack-trace lines first so prefix stripping does not swallow the
  // leading whitespace the stack-trace regex needs to match.
  let cleaned = raw.replace(/\s+at handler \([^)]+\)\s*/gi, "");
  // Remove [CONVEX M(...)] [Request ID: ...] prefix
  cleaned = cleaned.replace(/\[CONVEX M\([^)]+\)\]\s*\[Request ID:\s*[a-f0-9]+\]\s*/gi, "");
  // Remove "Uncaught Error:" prefix
  cleaned = cleaned.replace(/^Uncaught Error:\s*/i, "");
  // Remove "Server Error" prefix
  cleaned = cleaned.replace(/^Server Error\s*/i, "");
  // Remove "Called by client" suffix
  cleaned = cleaned.replace(/\s*Called by client\s*$/i, "");
  cleaned = cleaned.trim();
  // If stripping removed the entire message, fall back to the raw error so the
  // user (and developers) see *something* actionable instead of a generic line.
  return cleaned || raw.trim() || "An unexpected error occurred.";
}

/** Extract a string message from any thrown value, including Convex errors. */
export function getErrorMessage(err: unknown): string {
  if (err === null || err === undefined) return "An unexpected error occurred.";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  // ConvexError / structured errors may expose the message in a `data` or
  // `message` property. Try the most common shapes without exposing internals.
  const record = err as Record<string, unknown>;
  if (typeof record.message === "string" && record.message) return record.message;
  if (typeof record.error === "string" && record.error) return record.error;
  if (typeof record.errorMessage === "string" && record.errorMessage) return record.errorMessage;
  if (typeof record.data === "string" && record.data) return record.data;
  try {
    return JSON.stringify(err);
  } catch {
    return "An unexpected error occurred.";
  }
}

interface TestResultAlertProps {
  result: TestResult | null;
  successMessage: string;
}

export function TestResultAlert({ result, successMessage }: TestResultAlertProps) {
  if (!result) return null;

  const displayError = result.error ? cleanConvexError(result.error) : undefined;
  const displayMessage = result.success ? (result.message || successMessage) : undefined;

  return (
    <div
      className={`p-4 rounded-xl flex items-start gap-3 border shadow-sm ${
        result.success
          ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
          : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
      }`}
    >
      {result.success ? (
        <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      )}
      <div className="text-sm font-medium leading-relaxed">
        {result.success ? displayMessage : displayError}
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  isConfigured: boolean | undefined;
  configuredLabel: string;
  configuredValue?: string | null;
  unconfiguredLabel: string;
  useRed?: boolean;
}

export function StatusBadge({
  isConfigured,
  configuredLabel,
  configuredValue,
  unconfiguredLabel,
  useRed = true,
}: StatusBadgeProps) {
  if (isConfigured === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowPathIcon className="w-3 h-3 animate-spin" />
        Checking...
      </div>
    );
  }

  const bgClass = isConfigured
    ? "bg-green-500/10 text-green-500 border border-green-500/20"
    : useRed
      ? "bg-red-500/10 text-red-500 border border-red-500/20"
      : "bg-amber-500/10 text-amber-500 border border-amber-500/20";
  const dotClass = isConfigured ? "bg-green-500" : useRed ? "bg-red-500" : "bg-amber-500";

  const label = isConfigured
    ? (configuredValue ?? configuredLabel)
    : unconfiguredLabel;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${bgClass}`}
    >
      <div className={`w-2 h-2 rounded-full ${dotClass} animate-pulse shadow-sm`} />
      {label}
    </div>
  );
}
