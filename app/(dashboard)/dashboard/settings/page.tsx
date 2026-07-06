"use client";

import { useState, useEffect } from "react";
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

  const zeptomailStatus = useQuery(api.settings.getZeptomailKeyStatus);
  const setZeptomailKeyFn = useMutation(api.settings.setZeptomailKey);
  const removeZeptomailKeyFn = useMutation(api.settings.removeZeptomailKey);

  const [zeptomailApiKey, setZeptomailApiKey] = useState("");
  const [isSavingZeptomail, setIsSavingZeptomail] = useState(false);
  const [isRemovingZeptomail, setIsRemovingZeptomail] = useState(false);
  const [zeptomailTestResult, setZeptomailTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const zeptomailFromEmailStatus = useQuery(api.settings.getZeptomailFromEmailStatus);
  const setZeptomailFromEmailFn = useMutation(api.settings.setZeptomailFromEmail);
  const removeZeptomailFromEmailFn = useMutation(api.settings.removeZeptomailFromEmail);

  const [zeptomailFromEmail, setZeptomailFromEmail] = useState("");
  const [isSavingZeptomailFromEmail, setIsSavingZeptomailFromEmail] = useState(false);
  const [isRemovingZeptomailFromEmail, setIsRemovingZeptomailFromEmail] = useState(false);
  const [zeptomailFromEmailTestResult, setZeptomailFromEmailTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const zeptomailFromNameStatus = useQuery(api.settings.getZeptomailFromNameStatus);
  const setZeptomailFromNameFn = useMutation(api.settings.setZeptomailFromName);
  const removeZeptomailFromNameFn = useMutation(api.settings.removeZeptomailFromName);

  const [zeptomailFromName, setZeptomailFromName] = useState("");
  const [isSavingZeptomailFromName, setIsSavingZeptomailFromName] = useState(false);
  const [isRemovingZeptomailFromName, setIsRemovingZeptomailFromName] = useState(false);
  const [zeptomailFromNameTestResult, setZeptomailFromNameTestResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showSerperKey, setShowSerperKey] = useState(false);
  const [showFirecrawlKey, setShowFirecrawlKey] = useState(false);
  const [showZeptomailKey, setShowZeptomailKey] = useState(false);
  const [showGoogleCalendarJson, setShowGoogleCalendarJson] = useState(false);

  const wipeEverything = useMutation(api.wipeAllData.wipeEverything);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeResult, setWipeResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const testSerperKeyFn = useAction(api.settings.testSerperKey);
  const testFirecrawlKeyFn = useAction(api.settings.testFirecrawlKey);
  const testZeptomailKeyFn = useAction(api.settings.testZeptomailKey);

  const testGeminiKeyStoredFn = useAction(api.settings.testGeminiKeyStored);
  const testSerperKeyStoredFn = useAction(api.settings.testSerperKeyStored);
  const testFirecrawlKeyStoredFn = useAction(api.settings.testFirecrawlKeyStored);
  const testZeptomailKeyStoredFn = useAction(api.settings.testZeptomailKeyStored);

  const [isTestingSerper, setIsTestingSerper] = useState(false);
  const [isTestingFirecrawl, setIsTestingFirecrawl] = useState(false);
  const [isTestingZeptomail, setIsTestingZeptomail] = useState(false);
  const [isTestingGeminiStored, setIsTestingGeminiStored] = useState(false);
  const [isTestingSerperStored, setIsTestingSerperStored] = useState(false);
  const [isTestingFirecrawlStored, setIsTestingFirecrawlStored] = useState(false);
  const [isTestingZeptomailStored, setIsTestingZeptomailStored] = useState(false);

  const googleCalendarStatus = useQuery(api.settings.getGoogleCalendarStatus);
  const setGoogleCalendarJsonFn = useMutation(api.settings.setGoogleCalendarJson);
  const removeGoogleCalendarJsonFn = useMutation(api.settings.removeGoogleCalendarJson);
  const testGoogleCalendarFn = useAction(api.settings.testGoogleCalendar);

  const [googleCalendarJson, setGoogleCalendarJson] = useState("");
  const [isSavingGoogleCalendar, setIsSavingGoogleCalendar] = useState(false);
  const [isRemovingGoogleCalendar, setIsRemovingGoogleCalendar] = useState(false);
  const [isTestingGoogleCalendar, setIsTestingGoogleCalendar] = useState(false);
  const [googleCalendarTestResult, setGoogleCalendarTestResult] = useState<{
    success?: boolean;
    error?: string;
    message?: string;
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

  // Sync text input states with query results so users can see current values
  useEffect(() => {
    if (zeptomailFromEmailStatus?.fromEmail && !zeptomailFromEmail) {
      setZeptomailFromEmail(zeptomailFromEmailStatus.fromEmail);
    }
  }, [zeptomailFromEmailStatus?.fromEmail, zeptomailFromEmail]);

  useEffect(() => {
    if (zeptomailFromNameStatus?.fromName && !zeptomailFromName) {
      setZeptomailFromName(zeptomailFromNameStatus.fromName);
    }
  }, [zeptomailFromNameStatus?.fromName, zeptomailFromName]);

  useEffect(() => {
    if (googleCalendarIdStatus?.calendarId && !googleCalendarId) {
      setGoogleCalendarId(googleCalendarIdStatus.calendarId);
    }
  }, [googleCalendarIdStatus?.calendarId, googleCalendarId]);

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

  const handleTestZeptomail = async () => {
    if (!zeptomailApiKey) {
      setZeptomailTestResult({ success: false, error: "Please enter a key to test." });
      return;
    }
    setIsTestingZeptomail(true);
    setZeptomailTestResult(null);
    try {
      const res = await testZeptomailKeyFn({ apiKey: zeptomailApiKey });
      setZeptomailTestResult(res);
    } catch (err: unknown) {
      setZeptomailTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingZeptomail(false);
    }
  };

  const handleTestGeminiStored = async () => {
    setIsTestingGeminiStored(true);
    setTestResult(null);
    try {
      const res = await testGeminiKeyStoredFn({});
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingGeminiStored(false);
    }
  };

  const handleTestSerperStored = async () => {
    setIsTestingSerperStored(true);
    setSerperTestResult(null);
    try {
      const res = await testSerperKeyStoredFn({});
      setSerperTestResult(res);
    } catch (err: unknown) {
      setSerperTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingSerperStored(false);
    }
  };

  const handleTestFirecrawlStored = async () => {
    setIsTestingFirecrawlStored(true);
    setFirecrawlTestResult(null);
    try {
      const res = await testFirecrawlKeyStoredFn({});
      setFirecrawlTestResult(res);
    } catch (err: unknown) {
      setFirecrawlTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingFirecrawlStored(false);
    }
  };

  const handleTestZeptomailStored = async () => {
    setIsTestingZeptomailStored(true);
    setZeptomailTestResult(null);
    try {
      const res = await testZeptomailKeyStoredFn({});
      setZeptomailTestResult(res);
    } catch (err: unknown) {
      setZeptomailTestResult({
        success: false,
        error: (err as Error).message || "Test failed.",
      });
    } finally {
      setIsTestingZeptomailStored(false);
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

  const handleSaveZeptomail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zeptomailApiKey) return;

    setIsSavingZeptomail(true);
    setZeptomailTestResult(null);
    try {
      await setZeptomailKeyFn({ apiKey: zeptomailApiKey });
      setZeptomailApiKey("");
      setZeptomailTestResult({ success: true });
    } catch (err: unknown) {
      setZeptomailTestResult({
        success: false,
        error: (err as Error).message || "Failed to save key.",
      });
    } finally {
      setIsSavingZeptomail(false);
    }
  };

  const handleRemoveZeptomail = async () => {
    if (!confirm("Are you sure you want to disconnect the ZeptoMail API?"))
      return;

    setIsRemovingZeptomail(true);
    setZeptomailTestResult(null);
    try {
      await removeZeptomailKeyFn();
      setZeptomailApiKey("");
      setZeptomailTestResult({
        success: true,
        error: "API Key removed successfully.",
      });
    } catch (err: unknown) {
      setZeptomailTestResult({
        success: false,
        error: (err as Error).message || "Failed to remove key.",
      });
    } finally {
      setIsRemovingZeptomail(false);
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

  const handleSaveZeptomailFromEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zeptomailFromEmail) return;

    setIsSavingZeptomailFromEmail(true);
    setZeptomailFromEmailTestResult(null);
    try {
      await setZeptomailFromEmailFn({ fromEmail: zeptomailFromEmail });
      setZeptomailFromEmail("");
      setZeptomailFromEmailTestResult({ success: true });
    } catch (err: unknown) {
      setZeptomailFromEmailTestResult({
        success: false,
        error: (err as Error).message || "Failed to save from email.",
      });
    } finally {
      setIsSavingZeptomailFromEmail(false);
    }
  };

  const handleRemoveZeptomailFromEmail = async () => {
    if (!confirm("Are you sure you want to reset the ZeptoMail From Email to default?"))
      return;

    setIsRemovingZeptomailFromEmail(true);
    setZeptomailFromEmailTestResult(null);
    try {
      await removeZeptomailFromEmailFn();
      setZeptomailFromEmail("");
      setZeptomailFromEmailTestResult({
        success: true,
        error: "From Email reset to default successfully.",
      });
    } catch (err: unknown) {
      setZeptomailFromEmailTestResult({
        success: false,
        error: (err as Error).message || "Failed to reset from email.",
      });
    } finally {
      setIsRemovingZeptomailFromEmail(false);
    }
  };

  const handleSaveZeptomailFromName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zeptomailFromName) return;

    setIsSavingZeptomailFromName(true);
    setZeptomailFromNameTestResult(null);
    try {
      await setZeptomailFromNameFn({ fromName: zeptomailFromName });
      setZeptomailFromName("");
      setZeptomailFromNameTestResult({ success: true });
    } catch (err: unknown) {
      setZeptomailFromNameTestResult({
        success: false,
        error: (err as Error).message || "Failed to save sender name.",
      });
    } finally {
      setIsSavingZeptomailFromName(false);
    }
  };

  const handleRemoveZeptomailFromName = async () => {
    if (!confirm("Are you sure you want to reset the ZeptoMail Sender Name to default?"))
      return;

    setIsRemovingZeptomailFromName(true);
    setZeptomailFromNameTestResult(null);
    try {
      await removeZeptomailFromNameFn();
      setZeptomailFromName("");
      setZeptomailFromNameTestResult({
        success: true,
        error: "Sender Name reset to default successfully.",
      });
    } catch (err: unknown) {
      setZeptomailFromNameTestResult({
        success: false,
        error: (err as Error).message || "Failed to reset sender name.",
      });
    } finally {
      setIsRemovingZeptomailFromName(false);
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

  const handleTestGoogleCalendar = async () => {
    setIsTestingGoogleCalendar(true);
    setGoogleCalendarTestResult(null);
    try {
      const result = await testGoogleCalendarFn({});
      setGoogleCalendarTestResult(result);
    } catch (err: unknown) {
      setGoogleCalendarTestResult({
        success: false,
        error: (err as Error).message || "Failed to test Google Calendar integration.",
      });
    } finally {
      setIsTestingGoogleCalendar(false);
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

            <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTest}
                disabled={!apiKey || isTesting || isSaving}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTesting ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test New Key"
                )}
              </button>

              <button
                type="button"
                onClick={handleTestGeminiStored}
                disabled={isTestingGeminiStored || isSaving || isTesting}
                className="px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 text-sm font-semibold rounded-lg transition-all border border-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingGeminiStored ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Current"
                )}
              </button>

              <button
                type="submit"
                disabled={!apiKey || isSaving || isTesting || isTestingGeminiStored}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSaving ? "Saving..." : "Save Key"}
              </button>

              <button
                type="button"
                onClick={handleRemove}
                disabled={isRemoving}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemoving ? "Disconnecting..." : "Disconnect"}
              </button>
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

            <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTestSerper}
                disabled={!serperApiKey || isTestingSerper || isSavingSerper}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingSerper ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test New Key"
                )}
              </button>

              <button
                type="button"
                onClick={handleTestSerperStored}
                disabled={isTestingSerperStored || isSavingSerper || isTestingSerper}
                className="px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 text-sm font-semibold rounded-lg transition-all border border-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingSerperStored ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Current"
                )}
              </button>

              <button
                type="submit"
                disabled={!serperApiKey || isSavingSerper || isTestingSerper || isTestingSerperStored}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingSerper ? "Saving..." : "Save Key"}
              </button>

              <button
                type="button"
                onClick={handleRemoveSerper}
                disabled={isRemovingSerper}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemovingSerper ? "Disconnecting..." : "Disconnect"}
              </button>
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

            <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTestFirecrawl}
                disabled={!firecrawlApiKey || isTestingFirecrawl || isSavingFirecrawl}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingFirecrawl ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test New Key"
                )}
              </button>

              <button
                type="button"
                onClick={handleTestFirecrawlStored}
                disabled={isTestingFirecrawlStored || isSavingFirecrawl || isTestingFirecrawl}
                className="px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 text-sm font-semibold rounded-lg transition-all border border-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingFirecrawlStored ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Current"
                )}
              </button>

              <button
                type="submit"
                disabled={!firecrawlApiKey || isSavingFirecrawl || isTestingFirecrawl || isTestingFirecrawlStored}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingFirecrawl ? "Saving..." : "Save Key"}
              </button>

              <button
                type="button"
                onClick={handleRemoveFirecrawl}
                disabled={isRemovingFirecrawl}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemovingFirecrawl ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ZeptoMail Configuration */}
      <div className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-500/10 rounded-xl border border-slate-500/20 shadow-sm">
                <KeyIcon className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  ZeptoMail Email API
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
              isConfigured={zeptomailStatus?.hasZeptomailKey}
              configuredLabel="Key Actively Configured"
              unconfiguredLabel="Not Configured"
            />
          </div>

          <form onSubmit={handleSaveZeptomail} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="zeptomailApiKey"
                className="text-sm font-semibold text-foreground"
              >
                API Key
              </label>
                <PasswordInput
                  id="zeptomailApiKey"
                  value={zeptomailApiKey}
                  onChange={setZeptomailApiKey}
                  placeholder={
                    zeptomailStatus?.hasZeptomailKey
                      ? "••••••••••••••••••••••••••••"
                      : "Paste your ZeptoMail API Key..."
                  }
                  show={showZeptomailKey}
                  onToggleShow={() => setShowZeptomailKey((s) => !s)}
                  ringColor="slate"
                />
                <p className="text-[13px] text-muted-foreground">
                Your key will be securely stored in the database. Leave blank to
                keep the current key.
              </p>
            </div>

            <TestResultAlert
              result={zeptomailTestResult}
              successMessage="Connection successful! ZeptoMail API key is valid."
            />

            <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTestZeptomail}
                disabled={!zeptomailApiKey || isTestingZeptomail || isSavingZeptomail}
                className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-lg transition-all border border-card-border focus:outline-none focus:ring-2 focus:ring-muted-foreground focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingZeptomail ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test New Key"
                )}
              </button>

              <button
                type="button"
                onClick={handleTestZeptomailStored}
                disabled={isTestingZeptomailStored || isSavingZeptomail || isTestingZeptomail}
                className="px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 text-sm font-semibold rounded-lg transition-all border border-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 flex items-center justify-center min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isTestingZeptomailStored ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Test Current"
                )}
              </button>

              <button
                type="submit"
                disabled={!zeptomailApiKey || isSavingZeptomail || isTestingZeptomail || isTestingZeptomailStored}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingZeptomail ? "Saving..." : "Save Key"}
              </button>

              <button
                type="button"
                onClick={handleRemoveZeptomail}
                disabled={isRemovingZeptomail}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemovingZeptomail ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ZeptoMail From Email */}
      <div className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-500/10 rounded-xl border border-slate-500/20 shadow-sm">
                <KeyIcon className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  ZeptoMail From Email
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Sender email address used for all outbound emails via ZeptoMail.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-muted/40 rounded-xl border border-card-border/60">
            <span className="text-sm font-medium text-foreground">
              Current From Email
            </span>
            <StatusBadge
              isConfigured={zeptomailFromEmailStatus?.hasZeptomailFromEmail}
              configuredLabel="Custom From Email"
              configuredValue={zeptomailFromEmailStatus?.fromEmail}
              unconfiguredLabel="Using Default (outreach@fretbox.in)"
              useRed={false}
            />
          </div>

          <form onSubmit={handleSaveZeptomailFromEmail} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="zeptomailFromEmail"
                className="text-sm font-semibold text-foreground"
              >
                From Email Address
              </label>
              <input
                id="zeptomailFromEmail"
                type="email"
                value={zeptomailFromEmail}
                onChange={(e) => setZeptomailFromEmail(e.target.value)}
                placeholder="outreach@fretbox.in"
                className="flex h-11 w-full rounded-lg border border-card-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500 transition-all shadow-sm"
              />
              <p className="text-[13px] text-muted-foreground">
                This email must be verified in your ZeptoMail account. Leave blank to keep the current address.
              </p>
            </div>

            <TestResultAlert
              result={zeptomailFromEmailTestResult}
              successMessage="From Email saved successfully."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="submit"
                disabled={!zeptomailFromEmail || isSavingZeptomailFromEmail}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingZeptomailFromEmail ? "Saving..." : "Save Email"}
              </button>

              <button
                type="button"
                onClick={handleRemoveZeptomailFromEmail}
                disabled={isRemovingZeptomailFromEmail}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemovingZeptomailFromEmail ? "Resetting..." : "Reset to Default"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ZeptoMail Sender Name */}
      <div className="bg-card rounded-2xl border border-card-border/60 shadow-sm overflow-hidden">
        <div className="p-8 space-y-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-500/10 rounded-xl border border-slate-500/20 shadow-sm">
                <KeyIcon className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">
                  ZeptoMail Sender Name
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Display name shown as the sender for all outbound emails.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-5 bg-muted/40 rounded-xl border border-card-border/60">
            <span className="text-sm font-medium text-foreground">
              Current Sender Name
            </span>
            <StatusBadge
              isConfigured={zeptomailFromNameStatus?.hasZeptomailFromName}
              configuredLabel="Custom Sender Name"
              configuredValue={zeptomailFromNameStatus?.fromName}
              unconfiguredLabel="Using Default (Ashish Gupta)"
              useRed={false}
            />
          </div>

          <form onSubmit={handleSaveZeptomailFromName} className="space-y-5">
            <div className="space-y-2.5">
              <label
                htmlFor="zeptomailFromName"
                className="text-sm font-semibold text-foreground"
              >
                Sender Display Name
              </label>
              <input
                id="zeptomailFromName"
                type="text"
                value={zeptomailFromName}
                onChange={(e) => setZeptomailFromName(e.target.value)}
                placeholder="Ashish Gupta (Fretbox)"
                className="flex h-11 w-full rounded-lg border border-card-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500 transition-all shadow-sm"
              />
              <p className="text-[13px] text-muted-foreground">
                This name appears in the recipient&apos;s inbox as the sender.
              </p>
            </div>

            <TestResultAlert
              result={zeptomailFromNameTestResult}
              successMessage="Sender Name saved successfully."
            />

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="submit"
                disabled={!zeptomailFromName || isSavingZeptomailFromName}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSavingZeptomailFromName ? "Saving..." : "Save Name"}
              </button>

              <button
                type="button"
                onClick={handleRemoveZeptomailFromName}
                disabled={isRemovingZeptomailFromName}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemovingZeptomailFromName ? "Resetting..." : "Reset to Default"}
              </button>
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

              <button
                type="button"
                onClick={handleTestGoogleCalendar}
                disabled={isTestingGoogleCalendar || !googleCalendarStatus?.hasGoogleCalendarServiceAccount}
                className="px-5 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-sm font-semibold rounded-lg transition-all border border-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow flex items-center justify-center gap-2"
              >
                {isTestingGoogleCalendar ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </button>

              <button
                type="button"
                onClick={handleRemoveGoogleCalendar}
                disabled={isRemovingGoogleCalendar}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemovingGoogleCalendar ? "Removing..." : "Remove"}
              </button>
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
                placeholder="primary"
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

              <button
                type="button"
                onClick={handleRemoveGoogleCalendarId}
                disabled={isRemovingGoogleCalendarId}
                className="px-5 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-sm font-semibold rounded-lg transition-all border border-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ml-auto disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isRemovingGoogleCalendarId ? "Resetting..." : "Reset to Default"}
              </button>
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
