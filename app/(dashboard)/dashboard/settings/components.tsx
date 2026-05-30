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
}

interface TestResultAlertProps {
  result: TestResult | null;
  successMessage: string;
}

export function TestResultAlert({ result, successMessage }: TestResultAlertProps) {
  if (!result) return null;

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
        {result.success ? successMessage : result.error}
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
