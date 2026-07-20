import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — Skill Link" }, { name: "robots", content: "noindex" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      // Do not surface whether the account exists — always show neutral success.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // swallow — neutral response
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-6 pb-12">
        <Link to="/auth" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="size-4" /> Back to Sign In
        </Link>
        <BrandLogo size={42} textClassName="text-2xl text-foreground" className="mb-2 text-primary" />
        <h1 className="text-xl font-semibold mt-4 mb-1">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter the email tied to your account. We'll send a secure link to reset it.
        </p>

        {sent ? (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="size-5" />
              <span className="font-semibold">Check your email</span>
            </div>
            <p className="text-sm text-muted-foreground">
              If an account exists for that email, a password-reset link has been sent. It expires shortly, so use it soon.
            </p>
            <Link to="/auth" className="inline-block w-full text-center rounded-xl bg-primary text-primary-foreground py-3 font-semibold">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-xl border border-input bg-card pl-10 pr-3 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <button
              disabled={loading}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
