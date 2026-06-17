import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ArrowLeft, Mail, Lock, User as UserIcon, Phone } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const searchSchema = z.object({
  mode: z.enum(["login", "signup"]).optional().default("login"),
  role: z.enum(["customer", "worker"]).optional().default("customer"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in — Skill Link" }] }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(search.mode);
  const [role, setRole] = useState<"customer" | "worker">(search.role);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, phone, role },
          },
        });
        if (error) throw error;
        toast.success("Account created!");
        navigate({ to: role === "worker" ? "/worker/onboarding" : "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error(res.error.message ?? "Google sign-in failed");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 pt-6 pb-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <BrandLogo size={42} textClassName="text-2xl text-foreground" className="mb-2 text-primary" />

        <p className="text-muted-foreground mb-6">
          {mode === "login" ? "Welcome back. Sign in to continue." : "Create your account in seconds."}
        </p>

        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-muted rounded-xl">
            {(["customer","worker"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`py-2 rounded-lg text-sm font-semibold capitalize transition-all ${role === r ? "bg-card shadow-card text-primary" : "text-muted-foreground"}`}
              >
                I'm a {r}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <>
              <Field icon={UserIcon} placeholder="Full name" value={fullName} onChange={setFullName} required />
              <Field icon={Phone} placeholder="Phone (e.g. 024 000 0000)" value={phone} onChange={setPhone} type="tel" />
            </>
          )}
          <Field icon={Mail} placeholder="Email" value={email} onChange={setEmail} type="email" required />
          <Field icon={Lock} placeholder="Password" value={password} onChange={setPassword} type="password" required />
          <button
            disabled={loading}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" /> OR <div className="flex-1 h-px bg-border" />
        </div>
        <button
          onClick={onGoogle}
          className="w-full rounded-xl border border-input bg-card py-3.5 font-semibold flex items-center justify-center gap-2 hover:bg-accent"
        >
          <GoogleLogo /> Continue with Google
        </button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-primary font-semibold"
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ icon: Icon, value, onChange, ...rest }: any) {
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

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
  );
}
