import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, ShieldAlert, Clock, Layers, LifeBuoy, Star, Wallet, LogOut } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { AvatarUpload } from "@/components/avatar-upload";
import { ServiceAreaPicker } from "@/components/service-area-picker";
import { fetchActiveServiceAreas, fetchWorkerCoverage, saveWorkerServiceAreas, type WorkerCoverage } from "@/lib/service-areas";

import { supabase } from "@/integrations/supabase/client";
import { PageSkeleton } from "@/components/page-skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useAppRole } from "@/hooks/use-app-role";

export const Route = createFileRoute("/_authenticated/worker/profile")({
  head: () => ({ meta: [{ title: "My worker profile — Skill Link" }] }),
  component: WorkerProfilePage,
});

function WorkerProfilePage() {
  const { user } = useAuth();
  const { proStatus, hasApplication, rejectionReason, loading: roleLoading } = useAppRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    city: "", service_area: "", unavailable_note: "",
  });
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [draftCoverage, setDraftCoverage] = useState<WorkerCoverage>({ primaryId: null, additionalIds: [] });
  const [savingAreas, setSavingAreas] = useState(false);
  const [editingAreas, setEditingAreas] = useState(false);

  const { data: allAreas } = useQuery({
    queryKey: ["service-areas-active"],
    staleTime: 10 * 60_000,
    queryFn: fetchActiveServiceAreas,
  });
  const areaName = (id: string) => allAreas?.find((a) => a.id === id)?.name ?? "";

  const { data: coverage, isLoading: coverageLoading } = useQuery({
    queryKey: ["my-service-areas", user?.id],
    enabled: !!user,
    queryFn: () => fetchWorkerCoverage(user!.id),
  });


  const { data: wp, isLoading: wpLoading } = useQuery({
    queryKey: ["my-worker-profile", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    // Keep the last known professional record on screen while a refetch runs, so an
    // approved pro is never briefly treated as "no worker profile".
    placeholderData: (prev: any) => prev,
    queryFn: async () => {
      // NOTE: only columns readable by the owner may be selected here — restricted
      // columns (e.g. rejection_reason, identity docs) come from RPCs / useAppRole.
      const { data, error } = await supabase
        .from("worker_profiles")
        .select(
          "user_id, category_id, bio, years_experience, city, service_area, hourly_rate, callout_fee, starting_price, portfolio_images, verification_status, rating, reviews_count, jobs_completed, is_featured, is_available, unavailable_note, created_at, updated_at",
        )
        .eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: myProfile, isLoading: nameLoading } = useQuery({
    queryKey: ["my-profile-name", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await supabase.from("profiles").select("full_name, phone").eq("id", user!.id).maybeSingle()).data,
  });



  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => setAvatarUrl(data?.avatar_url ?? null));
  }, [user?.id]);

  useEffect(() => {
    if (coverage) setDraftCoverage(coverage);
  }, [coverage]);

  useEffect(() => {
    if (!wp) return;
    setForm({
      city: wp.city ?? "",
      service_area: wp.service_area ?? "",
      unavailable_note: (wp as any).unavailable_note ?? "",
    });
  }, [wp?.user_id, wp?.updated_at]);

  useEffect(() => {
    const next = myProfile?.phone ?? "";
    setPhone(next);
    setSavedPhone(next);
  }, [myProfile?.phone]);

  if (wpLoading || nameLoading || roleLoading) return <PageSkeleton rows={4} />;

  // Only a truly non-professional account (never onboarded) sees the setup CTA.
  // An approved / pending / rejected / suspended pro keeps this page during refetches.
  if (!wp && !hasApplication) {
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

  if (!wp) return <PageSkeleton rows={4} />;

  const status = String(wp.verification_status ?? proStatus);

  // Availability note only — legacy location columns are never written from this page.
  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("worker_profiles")
      .update({ unavailable_note: form.unavailable_note } as any)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
  };


  const savePhone = async () => {
    if (!user || phone === savedPhone) return;
    setSavingPhone(true);
    const { error } = await supabase.from("profiles").update({ phone }).eq("id", user.id);
    setSavingPhone(false);
    if (error) return toast.error(error.message);
    setSavedPhone(phone);
    qc.setQueryData(["my-profile-name", user.id], (old: any) =>
      old ? { ...old, phone } : { full_name: myProfile?.full_name ?? "", phone }
    );
    toast.success("Phone number updated");
    qc.invalidateQueries({ queryKey: ["my-profile-name"] });
  };

  // General service areas only — this never touches verification or professions.
  const saveCoverage = async () => {
    if (!user || !draftCoverage.primaryId) return;
    setSavingAreas(true);
    try {
      await saveWorkerServiceAreas(user.id, draftCoverage.primaryId, draftCoverage.additionalIds);
      toast.success("Service areas updated");
      setEditingAreas(false);
      qc.invalidateQueries({ queryKey: ["my-service-areas"] });
      qc.invalidateQueries({ queryKey: ["worker-coverage"] });
      qc.invalidateQueries({ queryKey: ["worker-coverage-ids"] });


    } catch (e: any) {
      toast.error(e?.message ?? "Could not save your service areas");
    } finally {
      setSavingAreas(false);
    }
  };




  const toggleAvailable = async (next: boolean) => {
    if (!user) return;
    const key = ["my-worker-profile", user.id];
    const previous = qc.getQueryData(key);
    // Optimistic: patch only availability fields, never replace the profile record.
    qc.setQueryData(key, (old: any) => (old ? { ...old, is_available: next } : old));
    const { error } = await supabase.from("worker_profiles").update({ is_available: next } as any).eq("user_id", user.id);
    if (error) {
      qc.setQueryData(key, previous);
      return toast.error(error.message);
    }
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
          </div>
          <p className="text-sm opacity-80">Your account settings</p>

        </div>

      </header>

      <main className="mx-auto max-w-md px-5 mt-5 space-y-3">
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
          status === "approved" ? "bg-success/10 border-success/30"
          : status === "rejected" ? "bg-destructive/10 border-destructive/30"
          : "bg-warning/15 border-warning/30"}`}>
          {status === "approved" ? <BadgeCheck className="size-5 text-success" /> : status === "rejected" ? <ShieldAlert className="size-5 text-destructive" /> : <Clock className="size-5" />}
          <div className="min-w-0">
            <p className="font-semibold capitalize">{status === "approved" ? "Verified professional" : `Verification ${status}`}</p>
            {status === "rejected" && rejectionReason && (
              <p className="text-sm text-muted-foreground">{rejectionReason}</p>
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
            <>
              <Field label="Note for customers (optional)">
                <input value={form.unavailable_note} onChange={(e) => setForm({ ...form, unavailable_note: e.target.value })} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="Back on Monday" />
              </Field>
              <button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Save note"}
              </button>
            </>
          )}
        </Section>


        <Section title="Profile photo">
          {user && <AvatarUpload userId={user.id} currentUrl={avatarUrl} fallbackText={user.email ?? "?"} onChange={setAvatarUrl} />}
        </Section>

        <Section title="Contact phone">
          <p className="text-xs text-muted-foreground">
            Customers will only see your number after they accept your application or booking.
          </p>
          <Field label="Phone number">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-input bg-card p-3 text-sm"
              placeholder="e.g. 024 123 4567"
            />
          </Field>
          <button
            onClick={savePhone}
            disabled={savingPhone || phone === savedPhone}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50"
          >
            {savingPhone ? "Saving…" : "Save phone"}
          </button>
        </Section>

        <Section title="General service areas">
          {coverageLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : editingAreas ? (
            <>
              <ServiceAreaPicker value={draftCoverage} onChange={setDraftCoverage} />
              <div className="flex gap-2">
                <button
                  onClick={() => { setDraftCoverage(coverage ?? { primaryId: null, additionalIds: [] }); setEditingAreas(false); }}
                  className="flex-1 rounded-xl border border-input bg-card py-3 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCoverage}
                  disabled={savingAreas || !draftCoverage.primaryId}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50"
                >
                  {savingAreas ? "Saving…" : "Save service areas"}
                </button>
              </div>
            </>
          ) : coverage?.primaryId ? (
            <>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Primary service area: </span><span className="font-semibold">{areaName(coverage.primaryId)}</span></p>
                {coverage.additionalIds.length > 0 && (
                  <p><span className="text-muted-foreground">Also serves: </span>{coverage.additionalIds.map(areaName).filter(Boolean).join(", ")}</p>
                )}
              </div>
              <button
                onClick={() => { setDraftCoverage(coverage); setEditingAreas(true); }}
                className="w-full rounded-xl border border-input bg-card py-3 font-semibold"
              >
                Edit service areas
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Choose where you mainly work so customers know your coverage.
              </p>
              <button
                onClick={() => setEditingAreas(true)}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold"
              >
                Set your service areas
              </button>
            </>
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
