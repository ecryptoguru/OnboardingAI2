"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { selectVisibleAlert } from "./apiAlertSelection";

const API_LABELS: Record<string, string> = {
  gemini: "Gemini",
  firecrawl: "Firecrawl",
  serper: "Serper",
};

/**
 * Global modal shown when a provider (Gemini / Firecrawl / Serper) hits quota
 * exhaustion or an error during any background activity. Alerts are recorded
 * by the backend (convex/apiAlerts.ts) and acknowledged from the UI so they
 * don't reappear.
 */
export function ApiAlertModal() {
  const alerts = useQuery(api.apiAlerts.list);
  const acknowledge = useMutation(api.apiAlerts.acknowledge);
  // Track every alert dismissed for this session so a NEW alert can still
  // surface while previously dismissed ones stay hidden until acknowledged
  // elsewhere or the page reloads.
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(
    () => new Set(),
  );
  const dialogRef = useRef<HTMLDivElement>(null);

  const dismissForSession = useCallback((id: string) => {
    setSessionDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const alert = selectVisibleAlert(alerts, sessionDismissed);
  const alertId = alert?._id ?? null;

  useEffect(() => {
    if (alertId) {
      dialogRef.current?.focus();
    }
  }, [alertId]);

  useEffect(() => {
    if (!alertId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissForSession(alertId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alertId, dismissForSession]);

  if (!alert) return null;

  const apiLabel = API_LABELS[alert.api] ?? "API";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-alert-title"
        tabIndex={-1}
        className="bg-card border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 outline-none"
      >
        <div className="flex justify-between items-center p-5 border-b border-card-border/60">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-red-500/10 rounded-xl">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
            </div>
            <h3 id="api-alert-title" className="font-semibold text-lg text-foreground tracking-tight">
              {apiLabel} Provider Issue
            </h3>
          </div>
          <button
            onClick={() => dismissForSession(alert._id)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Dismiss for this session"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-foreground text-sm leading-relaxed mb-3">
            {alert.message}
          </p>
          {alert.context ? (
            <p className="text-muted-foreground text-xs mb-4">
              Context: {alert.context}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs leading-relaxed mb-6">
            The {apiLabel} API may be out of credits or rate-limited. Check the
            API keys and plan status in Settings. Background enrichment
            continues in degraded mode where possible.
          </p>
          <div className="flex justify-end gap-3 mt-2">
            <button
              onClick={() => dismissForSession(alert._id)}
              className="px-4 py-2.5 text-sm font-medium text-muted-foreground bg-muted hover:bg-zinc-700/50 rounded-xl transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => void acknowledge({ id: alert._id })}
              className="px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors shadow-sm"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
