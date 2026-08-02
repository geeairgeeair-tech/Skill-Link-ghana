import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, ShieldAlert, Clock, Layers, LifeBuoy, Star, Wallet, LogOut } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { AvatarUpload } from "@/components/avatar-upload";
import { ImageUpload } from "@/components/image-upload";
import { supabase } from "@/integrations/supabase/client";
import { VerificationBadge } from "@/components/verification-badge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/profile")({
  head: () => ({ meta: [{ title: "My worker profile — Skill Link" }] }),
  component: WorkerProfilePage,
});

function WorkerProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    city: "", service_area: "", unavailable_note: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: wp } = useQuery({
    queryKey: ["my-worker-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select(
          "user_id, category_id, bio, years_experience, city, service_area, hourly_rate, callout_fee, starting_price, portfolio_images, verification_status, rating, reviews_count, jobs_completed, is_featured, is_available, unavailable_note, created_at, updated_at",
        )
        .eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile-name", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle()).data,
  });


  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => setAvatarUrl(data?.avatar_url ?? null));
  }, [user?.id]);

  useEffect(() => {
    if (!wp) return;
    setForm({
      bio: wp.bio ?? "",
      years_experience: wp.years_experience ?? 0,
      city: wp.city ?? "",
      service_area: wp.service_area ?? "",
      hourly_rate: wp.hourly_rate ?? 0,
      callout_fee: wp.callout_fee ?? 0,
      starting_price: wp.starting_price ?? 0,
      unavailable_note: (wp as any).unavailable_note ?? "",
    });
    setPortfolio(Array.isArray(wp.portfolio_images) ? (wp.portfolio_images as any[]).filter((x) => typeof x === "string") : []);
  }, [wp?.user_id, wp?.updated_at]);

  if (!wp) {
    return (
      <AppShell>
        <main className="mx-auto max-w-md px-5 py-10 text-center space-y-3">
          <p className="text-muted-foreground">You don't have a worker profile yet.</p>
          <Link to="/worker/onboarding" className="inline-block rounded-xl bg-primary text-primary-foreground px-4 py-2.5 font-semibold">
            Set up worker profile
          </Link>
        </main>
      </AppShell>
    );
  }

  const status = String(wp.verification_status);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("worker_profiles").update({ ...form } as any).eq("user_id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
  };

  const savePortfolio = async (urls: string[]) => {
    setPortfolio(urls);
    if (!user) return;
    const { error } = await supabase.from("worker_profiles").update({ portfolio_images: urls } as any).eq("user_id", user.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
  };

  const toggleAvailable = async (next: boolean) => {
    if (!user) return;
    const { error } = await supabase.from("worker_profiles").update({ is_available: next } as any).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "You're available for jobs" : "Marked unavailable");
    qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-4 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <BackButton fallback="/worker/dashboard" className="text-primary-foreground/90 hover:text-primary-foreground mb-2" />
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold truncate">{myProfile?.full_name || "Worker profile"}</h1>
            <VerificationBadge status={status} />
          </div>
          <p className="text-sm opacity-80">Everything customers see about you</p>
        </div>

      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
          status === "approved" ? "bg-success/10 border-success/30"
          : status === "rejected" ? "bg-destructive/10 border-destructive/30"
          : "bg-warning/15 border-warning/30"}`}>
          {status === "approved" ? <BadgeCheck className="size-5 text-success" /> : status === "rejected" ? <ShieldAlert className="size-5 text-destructive" /> : <Clock className="size-5" />}
          <div className="min-w-0">
            <p className="font-semibold capitalize">{status === "approved" ? "Verified professional" : `Verification ${status}`}</p>
            {status === "rejected" && (wp as any).rejection_reason && (
              <p className="text-sm text-muted-foreground">{(wp as any).rejection_reason}</p>
            )}
            {status !== "approved" && (
              <Link to="/worker/onboarding" className="inline-block mt-1 text-xs font-semibold text-primary">Update documents</Link>
            )}
          </div>
        </div>

        <Section title="Availability">
          <div className="flex items-center justify-between">
            <p className="text-sm">{wp.is_available ? "Available for new bookings" : "Currently unavailable"}</p>
            <button
              onClick={() => toggleAvailable(!wp.is_available)}
              className={`relative w-14 h-8 shrink-0 rounded-full transition-colors ${wp.is_available ? "bg-success" : "bg-muted-foreground/30"}`}
              aria-label="Toggle availability"
            >
              <span className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${wp.is_available ? "translate-x-6" : ""}`} />
            </button>
          </div>
          {!wp.is_available && (
            <Field label="Note for customers (optional)">
              <input value={form.unavailable_note} onChange={(e) => setForm({ ...form, unavailable_note: e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="Back on Monday" />
            </Field>
          )}
        </Section>

        <Section title="Profile photo">
          {user && <AvatarUpload userId={user.id} currentUrl={avatarUrl} fallbackText={user.email ?? "?"} onChange={setAvatarUrl} />}
        </Section>

        <Section title="About & service area">
          <Field label="Bio">
            <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Years experience">
              <input type="number" min={0} value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: +e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
          </div>
          <Field label="Service area">
            <input value={form.service_area} onChange={(e) => setForm({ ...form, service_area: e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
        </Section>

        <Section title="Pricing">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Call-out">
              <input type="number" min={0} value={form.callout_fee} onChange={(e) => setForm({ ...form, callout_fee: +e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
            <Field label="Hourly">
              <input type="number" min={0} value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: +e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
            <Field label="From">
              <input type="number" min={0} value={form.starting_price} onChange={(e) => setForm({ ...form, starting_price: +e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
          </div>
          <button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </Section>

        <Section title="Portfolio">
          {user && (
            <ImageUpload bucket="worker-portfolio" userId={user.id} prefix="work" multiple max={8}
              label="Photos of your work" hint="Saved automatically. Up to 8 photos."
              value={portfolio} onChange={savePortfolio} />
          )}
        </Section>

        <Section title="Verification documents">
          {(() => {
            const expireAt = (wp as any).documents_expire_at as string | null;
            const daysLeft = expireAt
              ? Math.ceil((new Date(expireAt).getTime() - Date.now()) / 86_400_000)
              : null;
            const resubmitRequested = !!(wp as any).documents_resubmission_requested_at;
            const expiringSoon = daysLeft != null && daysLeft <= 30;
            const canReplace = status === "rejected" || resubmitRequested || expiringSoon;
            const summary =
              status === "approved" ? "Verification approved"
              : status === "rejected" ? "Resubmission required"
              : status === "suspended" ? "Account suspended"
              : "Documents submitted — under review";
            return (
              <>
                <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
                  <p className="text-sm font-semibold">{summary}</p>
                  {(wp as any).documents_submitted_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Submitted {new Date((wp as any).documents_submitted_at).toLocaleDateString()}
                    </p>
                  )}
                  {expireAt && (
                    <p className={`text-[11px] ${expiringSoon ? "text-warning-foreground font-semibold" : "text-muted-foreground"}`}>
                      {daysLeft != null && daysLeft <= 0
                        ? `Expired on ${new Date(expireAt).toLocaleDateString()}`
                        : `Expires ${new Date(expireAt).toLocaleDateString()}${expiringSoon ? " — document expiring soon" : ""}`}
                    </p>
                  )}
                  {resubmitRequested && (
                    <p className="text-[11px] text-warning-foreground font-semibold">
                      {(wp as any).documents_resubmission_reason || "An admin requested updated documents."}
                    </p>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  For your security, your Ghana Card, selfie and document files are never shown here. Only Skill Link admins can review them.
                </p>
                {canReplace && (
                  <Link to="/worker/onboarding" className="inline-block text-xs font-semibold text-primary">Upload updated documents</Link>
                )}
              </>
            );
          })()}
        </Section>


        <div className="grid grid-cols-2 gap-2">
          <Tile to="/worker/professions" icon={Layers} label="My professions" />
          <Tile to="/worker/reviews" icon={Star} label="My reviews" />
          <Tile to="/worker/earnings" icon={Wallet} label="Earnings" />
          <Tile to="/support" icon={LifeBuoy} label="Support" />
        </div>

        <button
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
          className="w-full rounded-xl border border-input bg-card py-3 font-semibold inline-flex items-center justify-center gap-2 text-destructive"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </main>
    </AppShell>
  );
}

function Tile({ to, icon: Icon, label }: any) {
  return (
    <Link to={to} className="rounded-2xl bg-card border border-border p-4 flex items-center gap-2">
      <Icon className="size-4 text-primary" />
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}
function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <h3 className="font-display font-bold">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: any) {
  return <label className="block"><p className="text-[11px] font-semibold mb-1 text-muted-foreground uppercase tracking-wide">{label}</p>{children}</label>;
}
