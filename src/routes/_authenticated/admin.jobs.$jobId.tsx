import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/jobs/$jobId")({
  component: AdminJobDetail,
});

function SignedMedia({ path, kind }: { path: string; kind: "image" | "video" }) {
  const { data } = useQuery({
    queryKey: ["signed-media", path],
    queryFn: async () => (await supabase.storage.from("job-media").createSignedUrl(path, 3600)).data?.signedUrl ?? null,
    staleTime: 50 * 60 * 1000,
  });
  if (!data) return <div className="aspect-square bg-muted rounded-xl" />;
  return kind === "image"
    ? <img src={data} className="w-full rounded-xl object-cover" />
    : <video src={data} controls className="w-full rounded-xl bg-black" />;
}

function AdminJobDetail() {
  const { jobId } = Route.useParams();
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const { data: job, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-job", jobId],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_requests")
        .select("id, title, description, budget, urgency, status, preferred_at, media, city, service_area, lat, lng, created_at, updated_at, customer_id, category_id, categories(name)")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const customerId = (job as any)?.customer_id;

  const { data: customer } = useQuery({
    queryKey: ["admin-job-customer", customerId],
    enabled: !!customerId && role === "admin",
    queryFn: async () => {
      const [{ data: profile }, contactRes, emailRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url").eq("id", customerId).maybeSingle(),
        supabase.rpc("get_profile_contact", { _id: customerId }),
        supabase.rpc("get_user_email", { _user_id: customerId }),
      ]);
      const contact = ((contactRes.data as any[]) ?? [])[0] ?? {};
      return { ...profile, phone: contact.phone, address: contact.address, email: emailRes.data as string | null };
    },
  });

  const { data: applications } = useQuery({
    queryKey: ["admin-job-apps", jobId],
    enabled: role === "admin",
    queryFn: async () => {
      const { data } = await supabase
        .from("job_applications")
        .select("id, worker_id, status, quoted_price, eta_hours, note, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      const list = data ?? [];
      const ids = Array.from(new Set(list.map((a: any) => a.worker_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((a: any) => ({ ...a, worker: map.get(a.worker_id) }));
    },
  });

  const setStatus = async (next: string, label: string) => {
    if (!confirm(`${label} this job?`)) return;
    setBusy(true);
    const { error } = await supabase.from("job_requests").update({ status: next as any }).eq("id", jobId);
    if (error) { setBusy(false); return toast.error(error.message); }
    if (user?.id) {
      await supabase.from("admin_audit_logs").insert({
        admin_id: user.id,
        action: `job_${next}`,
        target_type: "job_request",
        details: { job_id: jobId, status: next },
      });
    }
    toast.success(`Job ${label.toLowerCase()}d`);
    qc.invalidateQueries({ queryKey: ["admin-job", jobId] });
    qc.invalidateQueries({ queryKey: ["admin-jobs-page"] });
    setBusy(false);
  };

  if (role && role !== "admin") {
    return <AppShell><div className="p-8 text-center"><p>Admin access required.</p></div></AppShell>;
  }
  if (isLoading) return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (isError) return (
    <AppShell>
      <div className="p-8 text-center text-sm space-y-2">
        <p className="text-destructive">Failed to load: {(error as any)?.message}</p>
        <button onClick={() => refetch()} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Retry</button>
      </div>
    </AppShell>
  );
  if (!job) return (
    <AppShell>
      <div className="p-8 text-center space-y-2">
        <p>Job not found.</p>
        <button onClick={() => navigate({ to: "/admin/jobs" })} className="text-primary font-semibold text-sm">Back to admin jobs</button>
      </div>
    </AppShell>
  );

  const j: any = job;
  const media: any[] = Array.isArray(j.media) ? j.media : [];

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-xl font-bold mt-2 truncate">{j.title}</h1>
        <p className="text-sm opacity-80">{j.categories?.name ?? "—"} · {j.status}</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3 pb-6">
        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm">Job details</h3>
          <p className="text-sm whitespace-pre-wrap">{j.description}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="Budget" value={j.budget ? `GH₵${j.budget}` : "—"} />
            <Info label="Urgency" value={j.urgency} />
            <Info label="Preferred" value={j.preferred_at ? new Date(j.preferred_at).toLocaleString() : "—"} />
            <Info label="Status" value={j.status} />
            <Info label="Service area" value={j.service_area ?? j.city ?? "—"} />
            <Info label="Created" value={new Date(j.created_at).toLocaleString()} />
            <Info label="Updated" value={new Date(j.updated_at).toLocaleString()} />
          </div>
        </section>

        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm">Customer</h3>
          <Info label="Full name" value={customer?.full_name ?? "—"} />
          <Info label="Registration email" value={customer?.email ?? "—"} />
          <Info label="Phone" value={customer?.phone ?? "—"} />
          <Info label="Full address" value={customer?.address ?? "—"} />
        </section>

        {media.length > 0 && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
            <h3 className="font-display font-bold text-sm">Media</h3>
            <div className="grid grid-cols-2 gap-2">
              {media.map((m: any, i: number) => (
                <SignedMedia key={i} path={m.path} kind={m.type === "video" ? "video" : "image"} />
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm">Applications ({applications?.length ?? 0})</h3>
          {(applications ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No applications yet.</p>
          ) : (applications ?? []).map((a: any) => (
            <div key={a.id} className="py-2 border-t border-border first:border-0">
              <p className="text-sm font-semibold">{a.worker?.full_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {a.status} · {a.quoted_price ? `GH₵${a.quoted_price}` : "no quote"} · ETA {a.eta_hours ?? "—"}h
              </p>
              {a.note && <p className="text-xs mt-1">{a.note}</p>}
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm">Moderation</h3>
          <div className="flex flex-wrap gap-2">
            {j.status !== "closed" && <ModBtn onClick={() => setStatus("closed", "Close")} busy={busy}>Close</ModBtn>}
            {j.status !== "cancelled" && <ModBtn onClick={() => setStatus("cancelled", "Cancel")} busy={busy} danger>Cancel</ModBtn>}
            {(j.status === "closed" || j.status === "cancelled") && <ModBtn onClick={() => setStatus("open", "Reopen")} busy={busy}>Reopen</ModBtn>}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
      <p className="text-sm break-words">{value ?? "—"}</p>
    </div>
  );
}

function ModBtn({ onClick, busy, danger, children }: { onClick: () => void; busy: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${danger ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}
    >
      {children}
    </button>
  );
}
