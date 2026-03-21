"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Link from "next/link";
import { KeyIcon, XMarkIcon } from "@heroicons/react/24/outline";

export function useRequireGeminiKey() {
  const [isOpen, setIsOpen] = useState(false);
  const status = useQuery(api.settings.getGeminiKeyStatus);

  // If status is undefined, it's still loading, we might want to just allow or block. 
  // Let's assume if it's not strictly "set", we block (unless it's undefined, we might briefly block. Better to check if it's "missing").
  const hasKey = status?.hasGeminiKey === true;

  const withKeyCheck = (fn: () => void) => {
    return (e?: React.MouseEvent) => {
      if (e) e.preventDefault();
      
      if (hasKey) {
        fn();
      } else {
        setIsOpen(true);
      }
    };
  };

  const keyModal = isOpen ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-card-border/80 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-card-border/60">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-500/10 rounded-xl">
              <KeyIcon className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="font-semibold text-lg text-foreground tracking-tight">API Key Required</h3>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            This AI feature requires a valid <strong className="text-foreground">Google Gemini API Key</strong>. Please configure your key in the Settings dashboard to continue.
          </p>
          <div className="flex justify-end gap-3 mt-2">
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2.5 text-sm font-medium text-muted-foreground bg-muted hover:bg-zinc-700/50 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <Link 
              href="/dashboard/settings"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors shadow-sm flex items-center"
            >
              Go to Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return { withKeyCheck, keyModal };
}
