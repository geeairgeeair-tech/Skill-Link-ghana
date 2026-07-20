import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { BadgeCheck, X, FileText, Image as ImageIcon, Eye, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Tab = "pending" | "all-workers" | "jobs" | "bookings";

async function attachProfiles<T extends { user_id: string }>(rows: T[]) {
  if (!rows.length) return rows as (T & { profile?: any })[];
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", ids);
  const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({ ...r, profile: map.get(r.user_id) })) as (T & { profile?: any })[];
}

function AdminPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");

  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ["admin-pending"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("worker_profiles")
        .select("user_id, years_experience, bio, service_area, city, hourly_rate, callout_fee, starting_price, created_at, category_id, categories(name)")
        .eq("verification_status", "pending")
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return []; }
      const enriched = await attachProfiles(rows ?? []);
      return await Promise.all(enriched.map(async (r: any) => {
        const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: r.user_id });
        const { data: contact } = await supabase.rpc("get_profile_contact", { _id: r.user_id });
        const i = (ident as any)?.[0] ?? {};
        const c = (contact as any)?.[0] ?? {};
        return { ...r, ghana_card_number: i.ghana_card_number, ghana_card_url: i.ghana_card_url, selfie_url: i.selfie_url, phone: c?.phone };
      }));
    },
  });

  const { data: allWorkers } = useQuery({
    queryKey: ["admin-all-workers"],
    enabled: role === "admin" && tab === "all-workers",
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("worker_profiles")
        .select("user_id, verification_status, jobs_completed, rating, reviews_count, is_available, categories(name)")
        .order("created_at", { ascending: false });
      return await attachProfiles((rows as any) ?? []);
    },
  });

  const { data: bookings } = useQuery({
    queryKey: ["admin-bookings"],
    enabled: role === "admin" && tab === "bookings",
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("bookings")
        .select("id, customer_id, worker_id, status, description, scheduled_at, estimated_cost, created_at, categories(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      const ids = Array.from(new Set((rows ?? []).flatMap((b: any) => [b.customer_id, b.worker_id].filter(Boolean))));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (rows ?? []).map((b: any) => ({ ...b, customer: map.get(b.customer_id), worker: map.get(b.worker_id) }));
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    enabled: role === "admin",
    queryFn: async () => {
      const [workers, bks, customers, completed] = await Promise.all([
        supabase.from("worker_profiles").select("user_id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
      ]);
      return { workers: workers.count ?? 0, bookings: bks.count ?? 0, customers: customers.count ?? 0, completed: completed.count ?? 0 };
    },
  });

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("worker_profiles").update({ verification_status: status }).eq("user_id", id);
    if (error) return toast.error(error.message);
    toast.success(`Worker ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-pending"] });
    qc.invalidateQueries({ queryKey: ["admin-all-workers"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const signedUrl = async (path: string | null) => {
    if (!path) return null;
    // Documents live in job-media bucket if uploaded; fallback to public URL.
    const res = await supabase.storage.from("job-media").createSignedUrl(path, 60 * 10);
    return res.data?.signedUrl ?? null;
  };

  if (role !== "admin") {
    return <AppShell><div className="p-8 text-center"><p>Admin access required.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <h1 className="font-display text-2xl font-bold">Admin</h1>
        <p className="text-sm opacity-80">Skill Link operations</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Workers" value={stats?.workers ?? 0} />
          <Stat label="Users" value={stats?.customers ?? 0} />
          <Stat label="Bookings" value={stats?.bookings ?? 0} />
          <Stat label="Done" value={stats?.completed ?? 0} />
        </div>

        <div className="flex gap-1 rounded-xl bg-muted p-1 text-xs font-semibold">
          <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>Pending ({pending?.length ?? 0})</TabBtn>
          <TabBtn active={tab === "all-workers"} onClick={() => setTab("all-workers")}>Workers</TabBtn>
          <TabBtn active={tab === "bookings"} onClick={() => setTab("bookings")}>Jobs</TabBtn>
        </div>

        {tab === "pending" && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h3 className="font-display font-bold">Pending verification</h3>
            {pendingLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (pending ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending applications.</p>
            ) : (pending ?? []).map((w: any) => (
              <PendingRow key={w.user_id} w={w} decide={decide} signedUrl={signedUrl} />
            ))}
          </section>
        )}

        {tab === "all-workers" && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h3 className="font-display font-bold">All workers</h3>
            {(allWorkers ?? []).length === 0 && <p className="text-sm text-muted-foreground">No workers yet.</p>}
            {(allWorkers ?? []).map((w: any) => (
              <div key={w.user_id} className="flex items-center justify-between py-2 border-t border-border first:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{w.profile?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {w.categories?.name ?? "—"} · {w.jobs_completed ?? 0} jobs · ★{Number(w.rating ?? 0).toFixed(1)} ({w.reviews_count ?? 0})
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${w.verification_status === "approved" ? "bg-success/15 text-success" : w.verification_status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{w.verification_status}</span>
                  {w.verification_status !== "approved" && (
                    <button onClick={() => decide(w.user_id, "approved")} className="text-[10px] px-2 py-1 rounded bg-success text-success-foreground font-bold">Approve</button>
                  )}
                  {w.verification_status !== "rejected" && (
                    <button onClick={() => decide(w.user_id, "rejected")} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Reject</button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === "bookings" && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h3 className="font-display font-bold">Recent bookings</h3>
            {(bookings ?? []).length === 0 && <p className="text-sm text-muted-foreground">No bookings yet.</p>}
            {(bookings ?? []).map((b: any) => (
              <div key={b.id} className="py-2 border-t border-border first:border-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm truncate">{b.customer?.full_name ?? "—"} → {b.worker?.full_name ?? "Unassigned"}</p>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">{b.status}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{b.categories?.name} · {b.description}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(b.created_at).toLocaleString()}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </AppShell>
  );
}

function PendingRow({ w, decide, signedUrl }: any) {
  const [urls, setUrls] = useState<{ card?: string; selfie?: string }>({});
  const [open, setOpen] = useState(false);
  const loadDocs = async () => {
    const [card, selfie] = await Promise.all([signedUrl(w.ghana_card_url), signedUrl(w.selfie_url)]);
    setUrls({ card: card ?? undefined, selfie: selfie ?? undefined });
  };
  return (
    <div className="py-3 border-t border-border first:border-0">
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 rounded-xl bg-primary-soft overflow-hidden flex items-center justify-center text-primary font-bold">
          {w.profile?.avatar_url ? (
            <img src={w.profile.avatar_url} alt={w.profile?.full_name} className="size-full object-cover" />
          ) : (w.profile?.full_name?.[0]?.toUpperCase() ?? "?")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{w.profile?.full_name ?? "Unnamed"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {w.categories?.name ?? "—"} · {w.years_experience ?? 0}y exp · {w.service_area ?? w.city ?? "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Submitted {new Date(w.created_at).toLocaleDateString()} · <span className="uppercase font-bold text-warning">pending</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">
          <Eye className="size-3" /> View Profile {open ? <ChevronUp className="size-3"/> : <ChevronDown className="size-3"/>}
        </button>
        <button onClick={() => decide(w.user_id, "approved")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success text-success-foreground text-xs font-semibold">
          <BadgeCheck className="size-3" /> Approve
        </button>
        <button onClick={() => decide(w.user_id, "rejected")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold">
          <X className="size-3" /> Reject
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-xl bg-muted/40 p-3 space-y-2 text-sm">
          <Detail label="Category" value={w.categories?.name} />
          <Detail label="Experience" value={`${w.years_experience ?? 0} years`} />
          <Detail label="Service area" value={w.service_area ?? w.city} />
          <Detail label="Phone" value={w.phone ?? "—"} />
          <Detail label="Ghana Card #" value={w.ghana_card_number ?? "—"} />
          <div className="grid grid-cols-3 gap-2">
            <Detail label="From (GH₵)" value={w.starting_price ?? "—"} />
            <Detail label="Hourly (GH₵)" value={w.hourly_rate ?? "—"} />
            <Detail label="Call-out (GH₵)" value={w.callout_fee ?? "—"} />
          </div>
          {w.bio && (
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Bio</p>
              <p className="text-sm">{w.bio}</p>
            </div>
          )}
          {(w.ghana_card_url || w.selfie_url) ? (
            <>
              <button onClick={loadDocs} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-semibold">
                <FileText className="size-3" /> Load documents
              </button>
              {(urls.card || urls.selfie) && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {urls.card && (
                    <a href={urls.card} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-border">
                      <div className="text-[10px] bg-muted px-2 py-1 font-semibold flex items-center gap-1"><ImageIcon className="size-3"/> Ghana Card</div>
                      <img src={urls.card} className="w-full aspect-video object-cover" />
                    </a>
                  )}
                  {urls.selfie && (
                    <a href={urls.selfie} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-border">
                      <div className="text-[10px] bg-muted px-2 py-1 font-semibold flex items-center gap-1"><ImageIcon className="size-3"/> Selfie</div>
                      <img src={urls.selfie} className="w-full aspect-video object-cover" />
                    </a>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">No verification documents uploaded.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: any) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}
function TabBtn({ active, onClick, children }: any) {
  return <button onClick={onClick} className={`flex-1 px-2 py-2 rounded-lg transition ${active ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{children}</button>;
}
function Stat({ label, value }: any) {
  return <div className="rounded-xl bg-card border border-border p-3 text-center"><p className="font-display font-bold text-xl text-primary">{value}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}
