import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/jobs/")({
  component: AdminJobsPage,
});

const STATUSES = ["all", "open", "assigned", "in_progress", "completed", "closed", "cancelled", "draft"];
const URGENCIES = ["all", "normal", "urgent", "emergency"];

function AdminJobsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [since, setSince] = useState("");
  const [q, setQ] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-jobs-page"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("job_requests")
        .select("id, title, status, urgency, budget, city, service_area, preferred_at, created_at, customer_id, category_id, categories(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = rows ?? [];
      const custIds = Array.from(new Set(list.map((r: any) => r.customer_id)));
      const [profsRes, appsRes] = await Promise.all([
        custIds.length ? supabase.from("profiles").select("id, full_name").in("id", custIds) : Promise.resolve({ data: [] as any[] }),
        list.length ? supabase.from("job_applications").select("job_id").in("job_id", list.map((r: any) => r.id)) : Promise.resolve({ data: [] as any[] }),
      ]);
      const pmap = new Map((profsRes.data ?? []).map((p: any) => [p.id, p]));
      const emails = await Promise.all(custIds.map(async (id) => [id, (await supabase.rpc("get_user_email", { _user_id: id })).data as string | null] as const));
      const emap = new Map(emails);
      const cmap = new Map<string, number>();
      (appsRes.data ?? []).forEach((a: any) => cmap.set(a.job_id, (cmap.get(a.job_id) ?? 0) + 1));
      return list.map((r: any) => ({ ...r, customer: pmap.get(r.customer_id), customer_email: emap.get(r.customer_id), app_count: cmap.get(r.id) ?? 0 }));
    },
  });

  useEffect(() => {
    if (role !== "admin") return;
    const ch = supabase.channel("admin-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-jobs-page"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [role, qc]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sinceDate = since ? new Date(since) : null;
    return (data ?? []).filter((j: any) => {
      if (status !== "all" && j.status !== status) return false;
      if (urgency !== "all" && j.urgency !== urgency) return false;
      if (categoryId !== "all" && j.category_id !== categoryId) return false;
      if (sinceDate && new Date(j.created_at) < sinceDate) return false;
      if (s && ![j.title, j.customer?.full_name, j.customer_email].filter(Boolean).some((v: string) => v.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [data, status, urgency, categoryId, since, q]);

  if (role && role !== "admin") {
    return <AppShell><div className="p-8 text-center"><p>Admin access required.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-2xl font-bold mt-2">Jobs</h1>
        <p className="text-sm opacity-80">All job posts</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, customer name or email…" className="w-full px-3 py-2 rounded-lg bg-muted text-sm" />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-2 rounded-lg bg-muted">
              {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
            </select>
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="px-2 py-2 rounded-lg bg-muted">
              {URGENCIES.map((s) => <option key={s} value={s}>{s === "all" ? "All urgencies" : s}</option>)}
            </select>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="px-2 py-2 rounded-lg bg-muted col-span-2">
              <option value="all">All categories</option>
              {(categories ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="px-2 py-2 rounded-lg bg-muted col-span-2" />
          </div>
          <button onClick={() => refetch()} className="w-full px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">{isFetching ? "Refreshing…" : "Refresh"}</button>
        </div>

        <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading jobs…</p>
          : isError ? (
            <div className="text-sm">
              <p className="text-destructive">Failed to load jobs: {(error as any)?.message}</p>
              <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Retry</button>
            </div>
          ) : filtered.length === 0 ? <p className="text-sm text-muted-foreground">No jobs match your filters.</p>
          : filtered.map((j: any) => (
            <div key={j.id} className="py-2 border-t border-border first:border-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm truncate">{j.title}</p>
                <span className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">{j.status}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {j.categories?.name ?? "—"} · {j.service_area ?? j.city ?? "—"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {j.customer?.full_name ?? "—"} · {j.customer_email ?? "—"}
              </p>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                {j.urgency && j.urgency !== "normal" && <span className="uppercase font-bold">{j.urgency}</span>}
                {j.budget ? <span>GH₵{j.budget}</span> : null}
                <span>{j.app_count} applications</span>
                <span>Posted {new Date(j.created_at).toLocaleDateString()}</span>
                {j.preferred_at && <span>Preferred {new Date(j.preferred_at).toLocaleString()}</span>}
              </div>
              <div className="mt-2">
                <Link to="/admin/jobs/$jobId" params={{ jobId: j.id }} className="text-[11px] font-semibold text-primary">View details →</Link>
              </div>
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
