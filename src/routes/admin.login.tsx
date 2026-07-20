import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Mail, Lock, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin sign in — Skill Link" }, { name: "robots", content: "noindex" }] }),
  component: AdminLoginPage,
});

async function resolveRole(userId: string): Promise<"admin" | "worker" | "customer"> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("worker")) return "worker";
  return "customer";
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If already signed in, route by role.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.user) { setChecking(false); return; }
      const role = await resolveRole(data.user.id);
      if (cancelled) return;
      if (role === "admin") navigate({ to: "/admin", replace: true });
      else if (role === "worker") navigate({ to: "/worker/dashboard", replace: true });
      else navigate({ to: "/", replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      const role = await resolveRole(data.user.id);
      if (role !== "admin") {
        // Do not reveal whether the account is an admin — same generic error.
        await supabase.auth.signOut();
        throw new Error("Invalid email or password");
      }
      toast.success("Welcome back");
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Sign-in failed";
      const msg = raw.toLowerCase().includes("invalid") ? "Invalid email or password" : raw;
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-6 pb-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <BrandLogo size={42} textClassName="text-2xl text-foreground" className="mb-2 text-primary" />
        <div className="mt-4 mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          <span>Admin sign in</span>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field icon={Mail} placeholder="Email" value={email} onChange={setEmail} type="email" required autoComplete="email" />
          <Field icon={Lock} placeholder="Password" value={password} onChange={setPassword} type="password" required autoComplete="current-password" />
          <div className="flex justify-end -mt-1">
            <Link to="/forgot-password" className="text-xs font-semibold text-primary">Forgot password?</Link>
          </div>
          <button
            disabled={loading}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50"
          >
            {loading ? "Please wait…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Admin accounts are provisioned by the Skill Link team. There is no public signup here.
        </p>
      </div>
    </div>
  );
}

function Field({ icon: Icon, value, onChange, ...rest }: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Icon className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-card pl-10 pr-3 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
    </div>
  );
}
