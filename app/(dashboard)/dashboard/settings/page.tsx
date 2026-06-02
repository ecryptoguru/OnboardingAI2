"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { KeyIcon, ArrowPathIcon, EyeIcon, EyeSlashIcon, TrashIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { PasswordInput, TestResultAlert, StatusBadge } from "./components";

export default function SettingsPage() {
  const status = useQuery(api.settings.getGeminiKeyStatus);
  const setKey = useMutation(api.settings.setGeminiKey);
  const testKey = useAction(api.settings.testGeminiKey);
  const removeKey = useMutation(api.settings.removeGeminiKey);

  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const serperStatus = useQuery(api.settings.getSerperKeyStatus);
  const setSerperKeyFn = useMutation(api.settings.setSerperKey);
  const removeSerperKeyFn = useMutation(api.settings.removeSerperKey);

  const [serperApiKey, setSerperApiKey] = useState("");
  const [isSavingSerper, setIsSavingSerper] = useState(false);
  const [isRemovingSerper, setIsRemovingSerper] = useState(false);
  const [serperTestResult, setSerperTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const firecrawlStatus = useQuery(api.settings.getFirecrawlKeyStatus);
  const setFirecrawlKeyFn = useMutation(api.settings.setFirecrawlKey);
  const removeFirecrawlKeyFn = useMutation(api.settings.removeFirecrawlKey);

  const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
  const [isSavingFirecrawl, setIsSavingFirecrawl] = useState(false);
  const [isRemovingFirecrawl, setIsRemovingFirecrawl] = useState(false);
  const [firecrawlTestResult, setFirecrawlTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const sendgridStatus = useQuery(api.settings.getSendgridKeyStatus);
  const setSendgridKeyFn = useMutation(api.settings.setSendgridKey);
  const removeSendgridKeyFn = useMutation(api.settings.removeSendgridKey);

  const [sendgridApiKey, setSendgridApiKey] = useState("");
  const [isSavingSendgrid, setIsSavingSendgrid] = useState(false);
  const [isRemovingSendgrid, setIsRemovingSendgrid] = useState(false);
  const [sendgridTestResult, setSendgridTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const sendgridFromEmailStatus = useQuery(api.settings.getSendgridFromEmailStatus);
  const setSendgridFromEmailFn = useMutation(api.settings.setSendgridFromEmail);
  const removeSendgridFromEmailFn = useMutation(api.settings.removeSendgridFromEmail);

  const [sendgridFromEmail, setSendgridFromEmail] = useState("");
  const [isSavingSendgridFromEmail, setIsSavingSendgridFromEmail] = useState(false);
  const [isRemovingSendgridFromEmail, setIsRemovingSendgridFromEmail] = useState(false);
  const [sendgridFromEmailTestResult, setSendgridFromEmailTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showSerperKey, setShowSerperKey] = useState(false);
  const [showFirecrawlKey, setShowFirecrawlKey] = useState(false);
  const [showSendgridKey, setShowSendgridKey] = useState(false);
  const [showGoogleCalendarJson, setShowGoogleCalendarJson] = useState(false);

  const wipeEverything = useMutation(api.wipeAllData.wipeEverything);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeResult, setWipeResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const testSerperKeyFn = useAction(api.settings.testSerperKey);
  const testFirecrawlKeyFn = useAction(api.settings.testFirecrawlKey);
  const testSendgridKeyFn = useAction(api.settings.testSendgridKey);

  const [isTestingSerper, setIsTestingSerper] = useState(false);
  const [isTestingFirecrawl, setIsTestingFirecrawl] = useState(false);
  const [isTestingSendgrid, setIsTestingSendgrid] = useState(false);

  const googleCalendarStatus = useQuery(api.settings.getGoogleCalendarStatus);
  const setGoogleCalendarJsonFn = useMutation(api.settings.setGoogleCalendarJson);
  const removeGoogleCalendarJsonFn = useMutation(api.settings.removeGoogleCalendarJson);

  const [googleCalendarJson, setGoogleCalendarJson] = useState("");
  const [isSavingGoogleCalendar, setIsSavingGoogleCalendar] = useState(false);
  const [isRemovingGoogleCalendar, setIsRemovingGoogleCalendar] = useState(false);
  const [googleCalendarTestResult, setGoogleCalendarTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const googleCalendarIdStatus = useQuery(api.settings.getGoogleCalendarIdStatus);
  const setGoogleCalendarIdFn = useMutation(api.settings.setGoogleCalendarId);
  const removeGoogleCalendarIdFn = useMutation(api.settings.removeGoogleCalendarId);

  const [googleCalendarId, setGoogleCalendarId] = useState("");
  const [isSavingGoogleCalendarId, setIsSavingGoogleCalendarId] = useState(false);
  const [isRemovingGoogleCalendarId, setIsRemovingGoogleCalendarId] = useState(false);
  const [googleCalendarIdTestResult, setGoogleCalendarIdTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;

    setIsSaving(true);
    setTestResult(null);
    try {
      await setKey({ apiKey });
      setApiKey(""); // Clear it from local state after saving for security
      setTestResult({ success: true });
      // The status query will automatically update "Current Integration Status"
    } catch (err: unknown) {
      setTestResult({
        success: false,
        error: (err as Error).message || "Failed to save key.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey) {
      setTestResult({ success: false, error: "Please enter a key to test." });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testKey({ apiKey });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestSerper = async () => {
    if (!serperApiKey) {
      setSerperTestResult({ success: false, error: "Please enter a key to test." });
      return;
    }
    setIsTestingSerper(true);
    setSerperTestResult(null);
    try {
      const res = await testSerperKeyFn({ apiKey: serperApiKey });
      setSerperTestResult(res);
    } catch (err: unknown) {
      setSerperTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingSerper(false);
    }
  };

  const handleTestFirecrawl = async () => {
    if (!firecrawlApiKey) {
      setFirecrawlTestResult({ success: false, error: "Please enter a key to test." });
      return;
    }
    setIsTestingFirecrawl(true);
    setFirecrawlTestResult(null);
    try {
      const res = await testFirecrawlKeyFn({ apiKey: firecrawlApiKey });
      setFirecrawlTestResult(res);
    } catch (err: unknown) {
      setFirecrawlTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingFirecrawl(false);
    }
  };

  const handleTestSendgrid = async () => {
    if (!sendgridApiKey) {
      setSendgridTestResult({ success: false, error: "Please enter a key to test." });
      return;
    }
    setIsTestingSendgrid(true);
    setSendgridTestResult(null);
    try {
      const res = await testSendgridKeyFn({ apiKey: sendgridApiKey });
      setSendgridTestResult(res);
    } catch (err: unknown) {
      setSendgridTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingSendgrid(false);
    }
  };

  const handleRemove = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect the Gemini API? This will remove the stored key.",
      )
    )
      return;

    setIsRemoving(true);
    setTestResult(null);
    try {
      await removeKey();
      setApiKey("");
      setTestResult({ success: true, error: "API Key removed successfully." });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        error: (err as Error).message || "Failed to remove key.",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const handleSaveFirecrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firecrawlApiKey) return;

    setIsSavingFirecrawl(true);
    setFirecrawlTestResult(null);
    try {
      await setFirecrawlKeyFn({ apiKey: firecrawlApiKey });
      setFirecrawlApiKey("");
      setFirecrawlTestResult({ success: true });
    } catch (err: unknown) {
      setFirecrawlTestResult({
        success: false,
        error: (err as Error).message || "Failed to save key.",
      });
    } finally {
      setIsSavingFirecrawl(false);
    }
  };

  const handleRemoveFirecrawl = async () => {
    if (!confirm("Are you sure you want to disconnect the Firecrawl API?"))
      return;

    setIsRemovingFirecrawl(true);
    setFirecrawlTestResult(null);
    try {
      await removeFirecrawlKeyFn();
      setFirecrawlApiKey("");
      setFirecrawlTestResult({
        success: true,
        error: "API Key removed successfully.",
      });
    } catch (err: unknown) {
      setFirecrawlTestResult({
        success: false,
        error: (err as Error).message || "Failed to remove key.",
      });
    } finally {
      setIsRemovingFirecrawl(false);
    }
  };

  const handleSaveSendgrid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendgridApiKey) return;

    setIsSavingSendgrid(true);
    setSendgridTestResult(null);
    try {
      await setSendgridKeyFn({ apiKey: sendgridApiKey });
      setSendgridApiKey("");
      setSendgridTestResult({ success: true });
    } catch (err: unknown) {
      setSendgridTestResult({
        success: false,
        error: (err as Error).message || "Failed to save key.",
      });
    } finally {
      setIsSavingSendgrid(false);
    }
  };

  const handleRemoveSendgrid = async () => {
    if (!confirm("Are you sure you want to disconnect the SendGrid API?"))
      return;

    setIsRemovingSendgrid(true);
    setSendgridTestResult(null);
    try {
      await removeSendgridKeyFn();
      setSendgridApiKey("");
      setSendgridTestResult({
        success: true,
        error: "API Key removed successfully.",
      });
    } catch (err: unknown) {
      setSendgridTestResult({
        success: false,
        error: (err as Error).message || "Failed to remove key.",
      });
    } finally {
      setIsRemovingSendgrid(false);
    }
  };

  const handleSaveSerper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serperApiKey) return;

    setIsSavingSerper(true);
    setSerperTestResult(null);
    try {
      await setSerperKeyFn({ apiKey: serperApiKey });
      setSerperApiKey("");
      setSerperTestResult({ success: true });
    } catch (err: unknown) {
      setSerperTestResult({
        success: false,
        error: (err as Error).message || "Failed to save key.",
      });
    } finally {
      setIsSavingSerper(false);
    }
  };

  const handleRemoveSerper = async () => {
    if (!confirm("Are you sure you want to disconnect the Serper API?")) return;

    setIsRemovingSerper(true);
    setSerperTestResult(null);
    try {
      await removeSerperKeyFn();
      setSerperApiKey("");
      setSerperTestResult({
        success: true,
        error: "API Key removed successfully.",
      });
    } catch (err: unknown) {
      setSerperTestResult({
        success: false,
        error: (err as Error).message || "Failed to remove key.",
      });
    } finally {
      setIsRemovingSerper(false);
    }
  };

  const handleSaveSendgridFromEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendgridFromEmail) return;

    setIsSavingSendgridFromEmail(true);
    setSendgridFromEmailTestResult(null);
    try {
      await setSendgridFromEmailFn({ fromEmail: sendgridFromEmail });
      setSendgridFromEmail("");
      setSendgridFromEmailTestResult({ success: true });
    } catch (err: unknown) {
      setSendgridFromEmailTestResult({
        success: false,
        error: (err as Error).message || "Failed to save from email.",
      });
    } finally {
      setIsSavingSendgridFromEmail(false);
    }
  };

  const handleRemoveSendgridFromEmail = async () => {
    if (!confirm("Are you sure you want to reset the SendGrid From Email to default?"))
      return;

    setIsRemovingSendgridFromEmail(true);
    setSendgridFromEmailTestResult(null);
    try {
      await removeSendgridFromEmailFn();
      setSendgridFromEmail("");
      setSendgridFromEmailTestResult({
        success: true,
        error: "From Email reset to default successfully.",
      });
    } catch (err: unknown) {
      setSendgridFromEmailTestResult({
        success: false,
        error: (err as Error).message || "Failed to reset from email.",
      });
    } finally {
      setIsRemovingSendgridFromEmail(false);
    }
  };

  const handleSaveGoogleCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleCalendarJson) return;

    setIsSavingGoogleCalendar(true);
    setGoogleCalendarTestResult(null);
    try {
      await setGoogleCalendarJsonFn({ serviceAccountJson: googleCalendarJson });
      setGoogleCalendarJson("");
      setGoogleCalendarTestResult({ success: true });
    } catch (err: unknown) {
      setGoogleCalendarTestResult({
        success: false,
        error: (err as Error).message || "Failed to save service account JSON.",
      });
    } finally {
      setIsSavingGoogleCalendar(false);
    }
  };

  const handleRemoveGoogleCalendar = async () => {
    if (!confirm("Are you sure you want to remove the Google Calendar Service Account?"))
      return;

    setIsRemovingGoogleCalendar(true);
    setGoogleCalendarTestResult(null);
    try {
      await removeGoogleCalendarJsonFn();
      setGoogleCalendarJson("");
      setGoogleCalendarTestResult({
        success: true,
        error: "Service Account removed successfully.",
      });
    } catch (err: unknown) {
      setGoogleCalendarTestResult({
        success: false,
        error: (err as Error).message || "Failed to remove service account.",
      });
    } finally {
      setIsRemovingGoogleCalendar(false);
    }
  };

  const handleSaveGoogleCalendarId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleCalendarId) return;

    setIsSavingGoogleCalendarId(true);
    setGoogleCalendarIdTestResult(null);
    try {
      await setGoogleCalendarIdFn({ calendarId: googleCalendarId });
      setGoogleCalendarId("");
      setGoogleCalendarIdTestResult({ success: true });
    } catch (err: unknown) {
      setGoogleCalendarIdTestResult({
        success: false,
        error: (err as Error).message || "Failed to save calendar ID.",
      });
    } finally {
      setIsSavingGoogleCalendarId(false);
    }
  };

  const handleRemoveGoogleCalendarId = async () => {
    if (!confirm("Are you sure you want to reset the Google Calendar ID to default (primary)?"))
      return;

    setIsRemovingGoogleCalendarId(true);
    setGoogleCalendarIdTestResult(null);
    try {
      await removeGoogleCalendarIdFn();
      setGoogleCalendarId("");
      setGoogleCalendarIdTestResult({
        success: true,
        error: "Calendar ID reset to default successfully.",
      });
    } catch (err: unknown) {
      setGoogleCalendarIdTestResult({
        success: false,
        error: (err as Error).message || "Failed to reset calendar ID.",
      });
    } finally {
      setIsRemovingGoogleCalendarId(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">
          Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your workspace configuration and API integrations.
        </p>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="p-6 border-b border-card-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-500 shadow-inner">
              <KeyIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Google Gemini API Configuration
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Used for complex reasoning, reply classification, and proposal
                generation.
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
              isConfigured={status?.hasGeminiKey}
              configuredLabel="Key Actively Configured"
              unconfiguredLabel="Not Configured"
            />
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="apiKey"
                className="text-sm font-semibold text-foreground"
              >
                API Key
              </label>
              <PasswordInput
                id="apiKey"
                value={apiKey}
                onChange={setApiKey}
                placeholder={
                  status?.hasGeminiKey
                    ? "••••••••••••••••••••••••••••"
                    : "AIzaSy..."
                }
                show={showGeminiKey}
                onToggleShow={() => setShowGeminiKey((s) => !s)}
                ringColor="blue"
              />
              <p className="text-[13px] text-muted-foreground">
                Your key will be securely stored in the database. Leave blank to
                keep the current key.
              </p>
            </div>

            <TestResultAlert
              result={testResult}
              successMessage="Connection successful! Gemini API is responding correctly."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTest}
                disabled={!apiKey || isTesting || isSaving}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTesting ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Connection"
                )}
              </button>

              <button
                type="submit"
                disabled={!apiKey || isSaving || isTesting}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSaving ? "Saving..." : "Save Key"}
              </button>

              {status?.hasGeminiKey && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={isRemoving}
                  className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {isRemoving ? "Disconnecting..." : "Disconnect"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="p-6 border-b border-card-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-500 shadow-inner">
              <KeyIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Serper API Configuration
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Used for Google Search, News, and Image discovery during
                enrichment.
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
              isConfigured={serperStatus?.hasSerperKey}
              configuredLabel="Key Actively Configured"
              unconfiguredLabel="Not Configured"
            />
          </div>

          <form onSubmit={handleSaveSerper} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="serperApiKey"
                className="text-sm font-semibold text-foreground"
              >
                API Key
              </label>
              <PasswordInput
                id="serperApiKey"
                value={serperApiKey}
                onChange={setSerperApiKey}
                placeholder={
                  serperStatus?.hasSerperKey
                    ? "••••••••••••••••••••••••••••"
                    : "Paste your Serper API Key..."
                }
                show={showSerperKey}
                onToggleShow={() => setShowSerperKey((s) => !s)}
                ringColor="emerald"
              />
              <p className="text-[13px] text-muted-foreground">
                Your key will be securely stored in the database. Leave blank to
                keep the current key.
              </p>
            </div>

            <TestResultAlert
              result={serperTestResult}
              successMessage="Connection successful! Serper API key is valid."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTestSerper}
                disabled={!serperApiKey || isTestingSerper || isSavingSerper}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingSerper ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Connection"
                )}
              </button>

              <button
                type="submit"
                disabled={!serperApiKey || isSavingSerper || isTestingSerper}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingSerper ? "Saving..." : "Save Key"}
              </button>

              {serperStatus?.hasSerperKey && (
                <button
                  type="button"
                  onClick={handleRemoveSerper}
                  disabled={isRemovingSerper}
                  className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {isRemovingSerper ? "Disconnecting..." : "Disconnect"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="p-6 border-b border-card-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-500 shadow-inner">
              <KeyIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Firecrawl API Configuration
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Used for deep web crawling, sitemap discovery, and contact
                extraction.
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
              isConfigured={firecrawlStatus?.hasFirecrawlKey}
              configuredLabel="Key Actively Configured"
              unconfiguredLabel="Not Configured"
            />
          </div>

          <form onSubmit={handleSaveFirecrawl} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="firecrawlApiKey"
                className="text-sm font-semibold text-foreground"
              >
                API Key
              </label>
                <PasswordInput
                  id="firecrawlApiKey"
                  value={firecrawlApiKey}
                  onChange={setFirecrawlApiKey}
                  placeholder={
                    firecrawlStatus?.hasFirecrawlKey
                      ? "••••••••••••••••••••••••••••"
                      : "Paste your Firecrawl API Key..."
                  }
                  show={showFirecrawlKey}
                  onToggleShow={() => setShowFirecrawlKey((s) => !s)}
                  ringColor="orange"
                />
                <p className="text-[13px] text-muted-foreground">
                Your key will be securely stored in the database. Leave blank to
                keep the current key.
              </p>
            </div>

            <TestResultAlert
              result={firecrawlTestResult}
              successMessage="Connection successful! Firecrawl API key is valid."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTestFirecrawl}
                disabled={!firecrawlApiKey || isTestingFirecrawl || isSavingFirecrawl}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingFirecrawl ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Connection"
                )}
              </button>

              <button
                type="submit"
                disabled={!firecrawlApiKey || isSavingFirecrawl || isTestingFirecrawl}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingFirecrawl ? "Saving..." : "Save Key"}
              </button>

              {firecrawlStatus?.hasFirecrawlKey && (
                <button
                  type="button"
                  onClick={handleRemoveFirecrawl}
                  disabled={isRemovingFirecrawl}
                  className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {isRemovingFirecrawl ? "Disconnecting..." : "Disconnect"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* SendGrid Configuration */}
      <div className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-500/10 rounded-xl border border-slate-500/20 shadow-sm">
                <KeyIcon className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  SendGrid Email API
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Used for sending transactional emails and outreach sequences.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-muted/40 rounded-xl border border-card-border/60">
            <span className="text-sm font-medium text-foreground">
              Current Integration Status
            </span>
            <StatusBadge
              isConfigured={sendgridStatus?.hasSendgridKey}
              configuredLabel="Key Actively Configured"
              unconfiguredLabel="Not Configured"
            />
          </div>

          <form onSubmit={handleSaveSendgrid} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="sendgridApiKey"
                className="text-sm font-semibold text-foreground"
              >
                API Key
              </label>
                <PasswordInput
                  id="sendgridApiKey"
                  value={sendgridApiKey}
                  onChange={setSendgridApiKey}
                  placeholder={
                    sendgridStatus?.hasSendgridKey
                      ? "••••••••••••••••••••••••••••"
                      : "Paste your SendGrid API Key..."
                  }
                  show={showSendgridKey}
                  onToggleShow={() => setShowSendgridKey((s) => !s)}
                  ringColor="slate"
                />
                <p className="text-[13px] text-muted-foreground">
                Your key will be securely stored in the database. Leave blank to
                keep the current key.
              </p>
            </div>

            <TestResultAlert
              result={sendgridTestResult}
              successMessage="Connection successful! SendGrid API key is valid."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTestSendgrid}
                disabled={!sendgridApiKey || isTestingSendgrid || isSavingSendgrid}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingSendgrid ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Connection"
                )}
              </button>

              <button
                type="submit"
                disabled={!sendgridApiKey || isSavingSendgrid || isTestingSendgrid}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingSendgrid ? "Saving..." : "Save Key"}
              </button>

              {sendgridStatus?.hasSendgridKey && (
                <button
                  type="button"
                  onClick={handleRemoveSendgrid}
                  disabled={isRemovingSendgrid}
                  className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {isRemovingSendgrid ? "Disconnecting..." : "Disconnect"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* SendGrid From Email */}
      <div className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-500/10 rounded-xl border border-slate-500/20 shadow-sm">
                <KeyIcon className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  SendGrid From Email
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Sender email address used for all outbound emails via SendGrid.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-muted/40 rounded-xl border border-card-border/60">
            <span className="text-sm font-medium text-foreground">
              Current From Email
            </span>
            <StatusBadge
              isConfigured={sendgridFromEmailStatus?.hasSendgridFromEmail}
              configuredLabel="Custom From Email"
              configuredValue={sendgridFromEmailStatus?.fromEmail}
              unconfiguredLabel="Using Default (outreach@fretbox.in)"
              useRed={false}
            />
          </div>

          <form onSubmit={handleSaveSendgridFromEmail} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="sendgridFromEmail"
                className="text-sm font-semibold text-foreground"
              >
                From Email Address
              </label>
              <input
                id="sendgridFromEmail"
                type="email"
                value={sendgridFromEmail}
                onChange={(e) => setSendgridFromEmail(e.target.value)}
                placeholder={
                  sendgridFromEmailStatus?.hasSendgridFromEmail
                    ? sendgridFromEmailStatus.fromEmail || "outreach@fretbox.in"
                    : "outreach@fretbox.in"
                }
                className="flex h-11 w-full rounded-lg border border-card-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500 transition-all shadow-sm"
              />
              <p className="text-[13px] text-muted-foreground">
                This email must be verified in your SendGrid account. Leave blank to keep the current address.
              </p>
            </div>

            <TestResultAlert
              result={sendgridFromEmailTestResult}
              successMessage="From Email saved successfully."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="submit"
                disabled={!sendgridFromEmail || isSavingSendgridFromEmail}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingSendgridFromEmail ? "Saving..." : "Save Email"}
              </button>

              {sendgridFromEmailStatus?.hasSendgridFromEmail && (
                <button
                  type="button"
                  onClick={handleRemoveSendgridFromEmail}
                  disabled={isRemovingSendgridFromEmail}
                  className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {isRemovingSendgridFromEmail ? "Resetting..." : "Reset to Default"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Google Calendar Service Account */}
      <div className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 shadow-sm">
                <KeyIcon className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  Google Calendar Service Account
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Service account JSON key for creating calendar events and Google Meet links.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-muted/40 rounded-xl border border-card-border/60">
            <span className="text-sm font-medium text-foreground">
              Current Integration Status
            </span>
            <StatusBadge
              isConfigured={googleCalendarStatus?.hasGoogleCalendarServiceAccount}
              configuredLabel="Service Account Configured"
              unconfiguredLabel="Not Configured"
            />
          </div>

          <form onSubmit={handleSaveGoogleCalendar} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="googleCalendarJson"
                className="text-sm font-semibold text-foreground"
              >
                Service Account JSON
              </label>
              <div className="relative">
                <textarea
                  id="googleCalendarJson"
                  value={googleCalendarJson}
                  onChange={(e) => setGoogleCalendarJson(e.target.value)}
                  placeholder={
                    googleCalendarStatus?.hasGoogleCalendarServiceAccount
                      ? "••••••••••••••••••••••••••••"
                      : "Paste your Google Service Account JSON key here..."
                  }
                  rows={4}
                  className={`flex w-full rounded-lg border border-card-border bg-background px-4 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all shadow-sm resize-y font-mono ${!showGoogleCalendarJson && googleCalendarJson ? "blur-[3px]" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowGoogleCalendarJson((s) => !s)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showGoogleCalendarJson ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Paste the entire JSON content from your Google Cloud service account key file. It will be securely stored in the database.
              </p>
            </div>

            <TestResultAlert
              result={googleCalendarTestResult}
              successMessage="Service Account JSON saved successfully."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="submit"
                disabled={!googleCalendarJson || isSavingGoogleCalendar}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingGoogleCalendar ? "Saving..." : "Save JSON"}
              </button>

              {googleCalendarStatus?.hasGoogleCalendarServiceAccount && (
                <button
                  type="button"
                  onClick={handleRemoveGoogleCalendar}
                  disabled={isRemovingGoogleCalendar}
                  className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {isRemovingGoogleCalendar ? "Removing..." : "Remove"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Google Calendar ID */}
      <div className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 shadow-sm">
                <KeyIcon className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  Google Calendar ID
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Target calendar for creating meeting events. Defaults to primary calendar.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-muted/40 rounded-xl border border-card-border/60">
            <span className="text-sm font-medium text-foreground">
              Current Calendar ID
            </span>
            <StatusBadge
              isConfigured={googleCalendarIdStatus?.hasGoogleCalendarId}
              configuredLabel="Calendar ID Configured"
              configuredValue={googleCalendarIdStatus?.calendarId}
              unconfiguredLabel="primary (default)"
              useRed={false}
            />
          </div>

          <form onSubmit={handleSaveGoogleCalendarId} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="googleCalendarId"
                className="text-sm font-semibold text-foreground"
              >
                Calendar ID
              </label>
              <input
                id="googleCalendarId"
                type="text"
                value={googleCalendarId}
                onChange={(e) => setGoogleCalendarId(e.target.value)}
                placeholder={
                  googleCalendarIdStatus?.hasGoogleCalendarId
                    ? googleCalendarIdStatus.calendarId || "primary"
                    : "primary"
                }
                className="flex h-11 w-full rounded-lg border border-card-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all shadow-sm"
              />
              <p className="text-[13px] text-muted-foreground">
                Use &quot;primary&quot; for your main calendar, or paste a specific calendar ID. Leave blank to keep the current ID.
              </p>
            </div>

            <TestResultAlert
              result={googleCalendarIdTestResult}
              successMessage="Calendar ID saved successfully."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="submit"
                disabled={!googleCalendarId || isSavingGoogleCalendarId}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingGoogleCalendarId ? "Saving..." : "Save ID"}
              </button>

              {googleCalendarIdStatus?.hasGoogleCalendarId && (
                <button
                  type="button"
                  onClick={handleRemoveGoogleCalendarId}
                  disabled={isRemovingGoogleCalendarId}
                  className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {isRemovingGoogleCalendarId ? "Resetting..." : "Reset to Default"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-card rounded-2xl border border-red-500/20 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 shadow-sm">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  Danger Zone
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Irreversible actions that permanently delete data.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-red-500/5 rounded-xl border border-red-500/10">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Wipe All Enrichment & Outreach Data</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Deletes all stakeholders, signals, sequences, emails, replies, proposals, and priority scores. Resets all university enrichment fields (demographics, website, stage, etc.) while keeping university names and UGC status intact.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowWipeModal(true);
                setWipeConfirmText("");
                setWipeResult(null);
              }}
              disabled={isWiping}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98] flex items-center gap-2"
            >
              <TrashIcon className="w-4 h-4" />
              Wipe Everything
            </button>
          </div>

          {wipeResult && (
            <div className={`p-4 rounded-xl border text-sm ${wipeResult.success ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-red-500/5 border-red-500/20 text-red-400"}`}>
              {wipeResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Wipe Confirmation Modal */}
      {showWipeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Confirm Data Wipe</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              This will permanently delete all stakeholders, signals, sequences, emails, replies, proposals, and priority scores. All universities will be reset to &quot;new&quot; stage with enrichment fields cleared.
            </p>
            <p className="text-sm text-foreground font-medium">
              Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">WIPE ALL DATA</span> to confirm:
            </p>
            <input
              type="text"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder="WIPE ALL DATA"
              className="w-full h-11 rounded-lg border border-card-border bg-background px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all shadow-sm"
            />
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWipeModal(false)}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (wipeConfirmText !== "WIPE ALL DATA") return;
                  setIsWiping(true);
                  try {
                    const result = await wipeEverything({});
                    setWipeResult({
                      success: true,
                      message: `Wiped ${result.universitiesReset} universities, deleted ${result.stakeholdersDeleted} stakeholders, ${result.signalsDeleted} signals, ${result.sequencesDeleted} sequences, ${result.emailsDeleted} emails, ${result.repliesDeleted} replies, ${result.proposalsDeleted} proposals, ${result.priorityScoresDeleted} scores.`,
                    });
                    setShowWipeModal(false);
                  } catch (err: unknown) {
                    setWipeResult({
                      success: false,
                      message: `Error: ${(err as Error).message || "Wipe failed"}`,
                    });
                    setShowWipeModal(false);
                  } finally {
                    setIsWiping(false);
                    setWipeConfirmText("");
                  }
                }}
                disabled={wipeConfirmText !== "WIPE ALL DATA" || isWiping}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98] flex items-center gap-2"
              >
                {isWiping ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <TrashIcon className="w-4 h-4" />
                )}
                {isWiping ? "Wiping..." : "Confirm Wipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
