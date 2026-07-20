import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  const { userId } = Route.useParams();
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [docs, setDocs] = useState<{ card?: string; selfie?: string }>({});

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-user-detail", userId],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_user_detail", { _user_id: userId });
      if (error) throw error;
      return (data as any[])?.[0] ?? null;
    },
  });

  if (role && role !== "admin") return <Navigate to="/" replace />;

  const logAction = async (action: string, details: any = {}) => {
    if (!user?.id) return;
    await supabase.from("admin_audit_logs").insert({
      admin_id: user.id, action, target_user_id: userId, target_type: "user", details,
    });
  };

  const setStatus = async (next: "approved" | "suspended" | "pending") => {
    const { error } = await supabase.from("worker_profiles")
      .update({ verification_status: next, rejection_reason: null, rejected_at: null })
      .eq("user_id", userId);
    if (error) return toast.error(error.message);
    await logAction(`worker_${next}`, { status: next });
    toast.success(`Worker ${next}`);
    qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
  };

  const rejectWorker = async () => {
    const reason = window.prompt("Enter rejection reason (required, min 5 chars):");
    if (!reason || reason.trim().length < 5) return toast.error("Rejection reason is required");
    const { error } = await supabase.rpc("admin_reject_worker", { _user_id: userId, _reason: reason.trim() });
    if (error) return toast.error(error.message);
    toast.success("Worker rejected");
    qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
  };

  const loadDocs = async () => {
    if (!data) return;
    const sign = async (path?: string | null) =>
      path ? (await supabase.storage.from("job-media").createSignedUrl(path, 600)).data?.signedUrl : undefined;
    const [card, selfie] = await Promise.all([sign(data.ghana_card_url), sign(data.selfie_url)]);
    setDocs({ card, selfie });
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-2xl font-bold mt-2">User details</h1>
        <p className="text-sm opacity-80">Admin view</p>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground p-4">Loading…</p>}
        {isError && (
          <div className="rounded-2xl bg-card border border-border p-4 text-sm">
            <p className="text-destructive">Failed: {(error as any)?.message}</p>
            <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Retry</button>
          </div>
        )}
        {data === null && !isLoading && <p className="text-sm text-muted-foreground p-4">User not found.</p>}
        {data && (
          <>
            <section className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start gap-3">
                <div className="size-14 rounded-xl bg-primary-soft grid place-items-center overflow-hidden text-primary font-bold">
                  {data.avatar_url ? <img src={data.avatar_url} alt="" className="size-full object-cover"/> : (data.full_name?.[0]?.toUpperCase() ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-lg truncate">{data.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{data.email ?? "—"}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">{(data.roles ?? []).join(", ") || "customer"}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Field label="Phone" value={data.phone} />
                <Field label="Joined" value={new Date(data.created_at).toLocaleDateString()} />
                <Field label="Address" value={data.address} className="col-span-2" />
                <Field label="Last sign-in" value={data.last_sign_in_at ? new Date(data.last_sign_in_at).toLocaleString() : "—"} />
                <Field label="Account" value={data.is_suspended ? "Suspended" : "Active"} />
              </div>
            </section>

            {data.is_worker && (
              <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold">Worker profile</h3>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${data.verification_status === "approved" ? "bg-success/15 text-success" : ["rejected","suspended"].includes(data.verification_status) ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{data.verification_status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Field label="Category" value={data.category_name} />
                  <Field label="Service area" value={data.service_area ?? data.city} />
                  <Field label="Experience" value={data.years_experience ? `${data.years_experience} yrs` : "—"} />
                  <Field label="Available" value={data.is_available ? "Yes" : "No"} />
                  <Field label="Date of birth" value={data.date_of_birth ?? "—"} />
                  <Field label="Age" value={data.age ? `${data.age}` : "—"} />
                  <Field label="Rating" value={`${Number(data.rating ?? 0).toFixed(1)} (${data.reviews_count ?? 0})`} />
                  <Field label="Jobs done" value={data.jobs_completed ?? 0} />
                  <Field label="Ghana Card" value={data.ghana_card_number ?? "—"} className="col-span-2" />
                  <Field label="Bio" value={data.bio} className="col-span-2" />
                </div>
                {data.rejection_reason && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-xs">
                    <p className="font-semibold text-destructive">Rejection reason</p>
                    <p>{data.rejection_reason}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{data.rejected_at ? new Date(data.rejected_at).toLocaleString() : ""}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button onClick={loadDocs} className="text-[11px] px-2 py-1 rounded bg-muted font-semibold">Load identity docs</button>
                  {docs.card && <a href={docs.card} target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 rounded bg-muted font-semibold">Ghana Card ↗</a>}
                  {docs.selfie && <a href={docs.selfie} target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 rounded bg-muted font-semibold">Selfie ↗</a>}
                  
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {data.verification_status !== "approved" && (
                    <button onClick={() => setStatus("approved")} className="text-[10px] px-2 py-1 rounded bg-success text-success-foreground font-bold">
                      {["rejected","suspended"].includes(data.verification_status) ? "Reactivate / Approve" : "Approve"}
                    </button>
                  )}
                  {data.verification_status === "approved" && (
                    <button onClick={() => setStatus("suspended")} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Suspend</button>
                  )}
                  {data.verification_status === "pending" && (
                    <button onClick={rejectWorker} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Reject (with reason)</button>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-2xl bg-card border border-border p-4">
              <h3 className="font-display font-bold mb-2">Activity</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Jobs posted" value={data.jobs_posted_count} />
                <Stat label="Bookings (cust)" value={data.bookings_as_customer_count} />
                <Stat label="Bookings (work)" value={data.bookings_as_worker_count} />
                <Stat label="Applications" value={data.applications_count} />
                <Stat label="Reviews recv" value={data.reviews_received_count} />
                <Stat label="Reviews sent" value={data.reviews_written_count} />
              </div>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

function Field({ label, value, className = "" }: any) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-medium break-words">{value ?? "—"}</p>
    </div>
  );
}
function Stat({ label, value }: any) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="font-display font-bold text-lg text-primary">{value ?? 0}</p>
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
