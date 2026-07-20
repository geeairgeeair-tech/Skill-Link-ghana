import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — Skill Link" }, { name: "robots", content: "noindex" }] }),
  component: ResetPasswordPage,
});

type Status = "checking" | "ready" | "invalid" | "saving" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase JS auto-detects recovery tokens in the URL hash and creates a session
    // with the PASSWORD_RECOVERY event. Listen for it, and also check current session.
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" && session) setStatus("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      // If we already have a session AND the URL looks like a recovery link, allow reset.
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const looksLikeRecovery = hash.includes("type=recovery") || hash.includes("access_token");
      if (data.session && (looksLikeRecovery || status === "checking")) {
        setStatus((s) => (s === "checking" ? "ready" : s));
      } else if (!data.session && !looksLikeRecovery) {
        // Give Supabase a brief moment to process the hash, then declare invalid.
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (!cancelled && !d2.session) setStatus("invalid");
          });
        }, 800);
      }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validPassword = (p: string) =>
    p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);

  const redirectByRole = async (userId: string) => {
    let resolved: "admin" | "worker" | "customer" = "customer";
    try {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const roles = (data ?? []).map((r: { role: string }) => r.role);
      if (roles.includes("admin")) resolved = "admin";
      else if (roles.includes("worker")) resolved = "worker";
    } catch { /* ignore */ }
    if (resolved === "admin") navigate({ to: "/admin" });
    else if (resolved === "worker") navigate({ to: "/worker/dashboard" });
    else navigate({ to: "/" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validPassword(password)) {
      setError("Use at least 8 characters, including letters and numbers.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setStatus("saving");
    try {
      const { data, error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      // Sign out other sessions where supported (ignore errors on older SDKs).
      try { await supabase.auth.signOut({ scope: "others" } as { scope: "others" }); } catch { /* noop */ }
      setStatus("done");
      toast.success("Password updated");
      if (data.user) setTimeout(() => redirectByRole(data.user!.id), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update password";
      setError(msg);
      setStatus("ready");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-6 pb-12">
        <Link to="/auth" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="size-4" /> Back to Sign In
        </Link>
        <BrandLogo size={42} textClassName="text-2xl text-foreground" className="mb-2 text-primary" />
        <h1 className="text-xl font-semibold mt-4 mb-1">Set a new password</h1>

        {status === "checking" && (
          <p className="text-sm text-muted-foreground mt-6">Verifying your reset link…</p>
        )}

        {status === "invalid" && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              <span className="font-semibold">Link invalid or expired</span>
            </div>
            <p className="text-sm text-muted-foreground">
              This reset link is no longer valid. Request a new one to continue.
            </p>
            <Link to="/forgot-password" className="inline-block w-full text-center rounded-xl bg-primary text-primary-foreground py-3 font-semibold">
              Request a new link
            </Link>
          </div>
        )}

        {(status === "ready" || status === "saving") && (
          <form onSubmit={onSubmit} className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground mb-3">
              Choose a password with at least 8 characters, mixing letters and numbers.
            </p>
            <FieldPw value={password} onChange={setPassword} placeholder="New password" />
            <FieldPw value={confirm} onChange={setConfirm} placeholder="Confirm new password" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              disabled={status === "saving"}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Update password"}
            </button>
          </form>
        )}

        {status === "done" && (
          <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="size-5" />
              <span className="font-semibold">Password updated</span>
            </div>
            <p className="text-sm text-muted-foreground">Redirecting you now…</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldPw({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Lock className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="w-full rounded-xl border border-input bg-card pl-10 pr-3 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}
