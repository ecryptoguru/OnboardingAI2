"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { RedirectIfAuthenticated } from "@/components/RedirectIfAuthenticated";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const emailValue = (formData.get("email") as string).trim().toLowerCase();

    if (!emailValue) {
      setError("Please enter your email address.");
      setLoading(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    try {
      await signIn("password", { flow: "reset", email: emailValue });
      setSent(true);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "";
      if (
        message.includes("SITE_URL") ||
        message.includes("Failed to send reset email") ||
        message.includes("RATE_LIMITED")
      ) {
        setError("Unable to send reset email. Please check server configuration or try again later.");
      } else {
        // Convex masks backend errors as "Server Error", so InvalidAccountId /
        // TooManyFailedAttempts arrive indistinguishable from other failures.
        // Show the same message whether the account exists or not (privacy).
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <RedirectIfAuthenticated />
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎸</div>
          <h1 className="text-2xl font-bold text-foreground">Forgot password</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Enter your email to receive a reset code
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              If an account exists with this email, a reset code has been sent. Check your inbox.
            </p>
            <Link
              href="/sign-in"
              className="text-indigo-400 hover:text-indigo-300 font-semibold text-sm"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Email
              </label>
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

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? "Sending…" : "Send reset code"}
            </button>

            <p className="text-center text-muted-foreground text-sm mt-6">
              Remember your password?{" "}
              <Link
                href="/sign-in"
                className="text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  </>
  );
}
