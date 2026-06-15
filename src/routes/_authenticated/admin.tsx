import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { BadgeCheck, X, FileText, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Tab = "pending" | "all-workers" | "bookings";

function AdminPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");

  const { data: pending } = useQuery({
    queryKey: ["admin-pending"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("worker_profiles")
        .select("user_id, years_experience, bio, service_area, city, profiles!worker_profiles_user_id_fkey(full_name, phone, avatar_url), categories(name)")
        .eq("verification_status", "pending")
        .order("created_at", { ascending: false });
      const enriched = await Promise.all((rows ?? []).map(async (r: any) => {
        const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: r.user_id });
        const i = (ident as any)?.[0] ?? {};
        return { ...r, ghana_card_number: i.ghana_card_number, ghana_card_url: i.ghana_card_url, selfie_url: i.selfie_url };
      }));
      return enriched;
    },
  });

  const { data: allWorkers } = useQuery({
    queryKey: ["admin-all-workers"],
    enabled: role === "admin" && tab === "all-workers",
    queryFn: async () => (await supabase
      .from("worker_profiles")
      .select("user_id, verification_status, jobs_completed, rating, reviews_count, is_available, profiles!worker_profiles_user_id_fkey(full_name, phone), categories(name)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: bookings } = useQuery({
    queryKey: ["admin-bookings"],
    enabled: role === "admin" && tab === "bookings",
    queryFn: async () => (await supabase
      .from("bookings")
      .select("id, status, description, scheduled_at, estimated_cost, created_at, customer:profiles!bookings_customer_id_fkey(full_name), worker:profiles!bookings_worker_id_fkey(full_name), categories(name)")
      .order("created_at", { ascending: false })
      .limit(50)).data ?? [],
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
  };

  const signedUrl = async (path: string | null) => {
    if (!path) return null;
    const { data } = await supabase.storage.from("worker-docs").createSignedUrl(path, 60 * 10).catch(() => ({ data: null as any }));
    return data?.signedUrl ?? path;
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
          <section className="rounded-2xl bg-card border border-border p-4">
            <h3 className="font-display font-bold mb-3">Pending verification</h3>
            {(pending ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending applications.</p>
            ) : (pending ?? []).map((w: any) => (
              <PendingRow key={w.user_id} w={w} decide={decide} signedUrl={signedUrl} />
            ))}
          </section>
        )}

        {tab === "all-workers" && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h3 className="font-display font-bold">All workers</h3>
            {(allWorkers ?? []).map((w: any) => (
              <div key={w.user_id} className="flex items-center justify-between py-2 border-t border-border first:border-0">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{w.profiles?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {w.categories?.name} · {w.jobs_completed ?? 0} jobs · ★{Number(w.rating ?? 0).toFixed(1)} ({w.reviews_count ?? 0})
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[10px] uppercase font-bold ${w.verification_status === "approved" ? "text-success" : w.verification_status === "rejected" ? "text-destructive" : "text-warning"}`}>{w.verification_status}</p>
                  <p className={`text-[10px] ${w.is_available ? "text-success" : "text-muted-foreground"}`}>{w.is_available ? "active" : "off"}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === "bookings" && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h3 className="font-display font-bold">Recent bookings</h3>
            {(bookings ?? []).map((b: any) => (
              <div key={b.id} className="py-2 border-t border-border first:border-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm truncate">{b.customer?.full_name} → {b.worker?.full_name ?? "Unassigned"}</p>
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
  const loadDocs = async () => {
    const [card, selfie] = await Promise.all([signedUrl(w.ghana_card_url), signedUrl(w.selfie_url)]);
    setUrls({ card: card ?? undefined, selfie: selfie ?? undefined });
  };
  return (
    <div className="py-3 border-t border-border first:border-0">
      <p className="font-semibold">{w.profiles?.full_name}</p>
      <p className="text-xs text-muted-foreground">
        {w.categories?.name} · {w.years_experience}y exp · {w.service_area ?? w.city}
      </p>
      <p className="text-xs text-muted-foreground">📞 {w.profiles?.phone} · ID: {w.ghana_card_number ?? "—"}</p>
      {w.bio && <p className="text-sm mt-1">{w.bio}</p>}
      <div className="flex gap-2 mt-2 flex-wrap">
        {(w.ghana_card_url || w.selfie_url) && (
          <button onClick={loadDocs} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">
            <FileText className="size-3" /> View documents
          </button>
        )}
        <button onClick={() => decide(w.user_id, "approved")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success text-success-foreground text-xs font-semibold"><BadgeCheck className="size-3" /> Approve</button>
        <button onClick={() => decide(w.user_id, "rejected")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold"><X className="size-3" /> Reject</button>
      </div>
      {(urls.card || urls.selfie) && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {urls.card && <a href={urls.card} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-border"><div className="text-[10px] bg-muted px-2 py-1 font-semibold flex items-center gap-1"><ImageIcon className="size-3"/> Ghana Card</div><img src={urls.card} className="w-full aspect-video object-cover" /></a>}
          {urls.selfie && <a href={urls.selfie} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-border"><div className="text-[10px] bg-muted px-2 py-1 font-semibold flex items-center gap-1"><ImageIcon className="size-3"/> Selfie</div><img src={urls.selfie} className="w-full aspect-video object-cover" /></a>}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return <button onClick={onClick} className={`flex-1 px-2 py-2 rounded-lg transition ${active ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{children}</button>;
}
function Stat({ label, value }: any) {
  return <div className="rounded-xl bg-card border border-border p-3 text-center"><p className="font-display font-bold text-xl text-primary">{value}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}
