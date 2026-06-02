"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useState } from "react";

export default function SignUpPage() {
  const { signIn } = useAuthActions();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    signIn("password", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      flow: formData.get("flow") as string,
      redirectTo: "/dashboard",
    })
      .catch((err: Error) => {
        console.error(err);
        setError("Could not create account. Try a different email.");
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
              className="w-full bg-card border border-card-border rounded-lg px-3.5 py-2.5 text-foreground text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@fretbox.in"
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
      </div>
    </div>
  );
}
