"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { useState } from "react";

export default function SignUpPage() {
  const { signIn } = useAuthActions();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  const emailExists = useQuery(
    api.auth.checkEmailExists,
    email.length > 3 ? { email } : "skip",
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const emailValue = (formData.get("email") as string).trim().toLowerCase();

    if (emailExists === true && email.length > 3) {
      setError("An account with this email already exists. Please sign in instead.");
      setLoading(false);
      return;
    }

    signIn("password", {
      email: emailValue,
      password: formData.get("password") as string,
      flow: formData.get("flow") as string,
      redirectTo: "/dashboard",
    })
      .catch((err: Error) => {
        console.error(err);
        const message = err.message || "";
        if (message.includes("Server Error")) {
          setError("Could not create account. This email may already be registered. Try signing in instead.");
        } else if (message.toLowerCase().includes("already") || message.toLowerCase().includes("exist")) {
          setError("An account with this email already exists. Please sign in instead.");
        } else if (message.toLowerCase().includes("password")) {
          setError("Password must be at least 8 characters.");
        } else if (message) {
          setError(message);
        } else {
          setError("Could not create account. Try a different email.");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎸</div>
          <h1 className="text-2xl font-bold text-foreground">Create account</h1>
          <p className="text-muted-foreground text-sm mt-1">Fretbox Outreach AI — team access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              suppressHydrationWarning
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-card border border-card-border rounded-lg px-3.5 py-2.5 text-foreground text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              suppressHydrationWarning
              className="w-full bg-card border border-card-border rounded-lg px-3.5 py-2.5 text-foreground text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="min 8 characters"
            />
          </div>

          {emailExists && email.length > 3 && (
            <p className="text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              An account with this email already exists.{" "}
              <Link href="/sign-in" className="underline font-semibold">Sign in instead</Link>.
            </p>
          )}

          <input name="flow" type="hidden" value="signUp" />

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-muted-foreground text-xs mt-6">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-indigo-400 hover:text-indigo-300">Sign in</Link>
        </p>
        <p className="text-[10px] text-zinc-500 mt-4 uppercase tracking-widest text-center">
          Authorized access only
        </p>
      </div>
    </div>
  );
}
