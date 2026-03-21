"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { KeyIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

export default function SettingsPage() {
  const status = useQuery(api.settings.getGeminiKeyStatus);
  const setKey = useMutation(api.settings.setGeminiKey);
  const testKey = useAction(api.settings.testGeminiKey);
  
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    
    setIsSaving(true);
    setTestResult(null);
    try {
      await setKey({ apiKey });
      setApiKey(""); // Clear it from local state after saving for security
      setTestResult({ success: true });
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || "Failed to save key." });
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
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || "Test failed." });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your workspace configuration and API integrations.</p>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="p-6 border-b border-card-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-500 shadow-inner">
              <KeyIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">Google Gemini API Configuration</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Used for complex reasoning, reply classification, and proposal generation.</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between bg-background border border-card-border p-4 rounded-lg">
            <span className="text-sm font-medium text-foreground">Current Integration Status</span>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${status?.hasGeminiKey ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              <div className={`w-2 h-2 rounded-full ${status?.hasGeminiKey ? 'bg-green-500' : 'bg-red-500'} animate-pulse shadow-sm`} />
              {status?.hasGeminiKey ? "Key Actively Configured" : "Not Configured"}
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2.5">
              <label htmlFor="apiKey" className="text-sm font-semibold text-foreground">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status?.hasGeminiKey ? "••••••••••••••••••••••••••••" : "AIzaSy..."}
                className="flex h-11 w-full rounded-lg border border-card-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm"
              />
              <p className="text-[13px] text-muted-foreground">
                Your key will be securely stored in the database. Leave blank to keep the current key.
              </p>
            </div>

            {testResult && (
              <div className={`p-4 rounded-xl flex items-start gap-3 border shadow-sm ${testResult.success ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'}`}>
                {testResult.success ? (
                  <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <div className="text-sm font-medium leading-relaxed">
                  {testResult.success 
                    ? "Connection successful! Gemini API is responding correctly." 
                    : testResult.error}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-5 border-t border-card-border">
              <button
                type="button"
                onClick={handleTest}
                disabled={!apiKey || isTesting}
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
                disabled={!apiKey || isSaving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow active:scale-[0.98]"
              >
                {isSaving ? "Saving..." : "Save Key"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
