import { createFileRoute, Link } from "@tanstack/react-router";
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

type Tab = "pending" | "all-workers" | "users" | "jobs" | "bookings";

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
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");

  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ["admin-pending"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("admin_list_workers", { _status: "pending" });
      if (error) { toast.error(error.message); return []; }
      // Attach identity docs for each pending worker
      return await Promise.all(((rows as any[]) ?? []).map(async (r: any) => {
        const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: r.user_id });
        const i = (ident as any)?.[0] ?? {};
        return { ...r, ghana_card_number: i.ghana_card_number, ghana_card_url: i.ghana_card_url, selfie_url: i.selfie_url };
      }));
    },
  });

  const { data: allWorkers } = useQuery({
    queryKey: ["admin-all-workers"],
    enabled: role === "admin" && tab === "all-workers",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_workers");
      if (error) { toast.error(error.message); return []; }
      return (data as any[]) ?? [];
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ["admin-all-users"],
    enabled: role === "admin" && tab === "users",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) { toast.error(error.message); return []; }
      return (data as any[]) ?? [];
    },
  });

  const { data: allJobs } = useQuery({
    queryKey: ["admin-all-jobs"],
    enabled: role === "admin" && tab === "jobs",
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("job_requests")
        .select("id, title, status, urgency, budget, city, service_area, created_at, customer_id, categories(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      const list = rows ?? [];
      // Attach customer profile
      const custIds = Array.from(new Set(list.map((r: any) => r.customer_id)));
      const { data: profs } = custIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", custIds)
        : { data: [] as any[] };
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const ids = list.map((r: any) => r.id);
      const { data: apps } = ids.length
        ? await supabase.from("job_applications").select("job_id").in("job_id", ids)
        : { data: [] as any[] };
      const cmap = new Map<string, number>();
      (apps ?? []).forEach((a: any) => cmap.set(a.job_id, (cmap.get(a.job_id) ?? 0) + 1));
      return list.map((r: any) => ({ ...r, customer: pmap.get(r.customer_id), app_count: cmap.get(r.id) ?? 0 }));
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
    // Audit log — non-blocking
    if (user?.id) {
      await supabase.from("admin_audit_logs").insert({
        admin_id: user.id,
        action: status === "approved" ? "worker_approved" : "worker_rejected",
        target_user_id: id,
        target_type: "worker",
        details: { status },
      });
    }
    toast.success(`Worker ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-pending"] });
    qc.invalidateQueries({ queryKey: ["admin-all-workers"] });
    qc.invalidateQueries({ queryKey: ["admin-all-users"] });
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

        <div className="flex gap-1 rounded-xl bg-muted p-1 text-xs font-semibold overflow-x-auto">
          <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>Pending ({pending?.length ?? 0})</TabBtn>
          <TabBtn active={tab === "all-workers"} onClick={() => setTab("all-workers")}>Workers</TabBtn>
          <TabBtn active={tab === "users"} onClick={() => setTab("users")}>Users</TabBtn>
          <TabBtn active={tab === "jobs"} onClick={() => setTab("jobs")}>Jobs</TabBtn>
          <TabBtn active={tab === "bookings"} onClick={() => setTab("bookings")}>Bookings</TabBtn>
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
            {(allWorkers ?? []).map((w: any) => {
              const subActive = w.subscription_expires_at && new Date(w.subscription_expires_at) > new Date();
              return (
                <div key={w.user_id} className="py-2 border-t border-border first:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{w.full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {w.category_name ?? "—"} · {w.jobs_completed ?? 0} jobs · ★{Number(w.rating ?? 0).toFixed(1)} ({w.reviews_count ?? 0})
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {w.email ?? "—"} · {w.phone ?? "no phone"} · DOB: {w.date_of_birth ?? "—"}{w.age ? ` (${w.age}y)` : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {w.service_area ?? w.city ?? "—"} · {w.years_experience ?? 0}y exp · Joined {new Date(w.created_at).toLocaleDateString()} · {w.is_available ? "Available" : "Unavailable"} · Sub: {subActive ? "Active" : "Inactive"}
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${w.verification_status === "approved" ? "bg-success/15 text-success" : w.verification_status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{w.verification_status}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {w.verification_status !== "approved" && (
                      <button onClick={() => decide(w.user_id, "approved")} className="text-[10px] px-2 py-1 rounded bg-success text-success-foreground font-bold">Approve</button>
                    )}
                    {w.verification_status !== "rejected" && (
                      <button onClick={() => decide(w.user_id, "rejected")} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">
                        {w.verification_status === "approved" ? "Suspend" : "Reject"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === "users" && <UsersPanel users={allUsers ?? []} />}


        {tab === "jobs" && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h3 className="font-display font-bold">All job posts</h3>
            {(allJobs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No job posts yet.</p>}
            {(allJobs ?? []).map((j: any) => (
              <div key={j.id} className="py-2 border-t border-border first:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{j.title}</p>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">{j.status}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {j.categories?.name ?? "—"} · by {j.customer?.full_name ?? "—"} · {j.service_area ?? j.city ?? "—"}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                  {j.urgency && j.urgency !== "normal" && <span className="uppercase font-bold">{j.urgency}</span>}
                  {j.budget ? <span>GH₵{j.budget}</span> : null}
                  <span>{j.app_count} applications</span>
                  <span>{new Date(j.created_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-2">
                  <Link to="/admin/jobs/$jobId" params={{ jobId: j.id }} className="text-[11px] font-semibold text-primary">View →</Link>
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
          {w.avatar_url ? (
            <img src={w.avatar_url} alt={w.full_name} className="size-full object-cover" />
          ) : (w.full_name?.[0]?.toUpperCase() ?? "?")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{w.full_name ?? "Unnamed"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {w.category_name ?? "—"} · {w.years_experience ?? 0}y exp · {w.service_area ?? w.city ?? "—"}
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
          <Detail label="Full name" value={w.full_name} />
          <Detail label="Registration email" value={w.email ?? "—"} />
          <Detail label="Phone" value={w.phone ?? "—"} />
          <div className="grid grid-cols-2 gap-2">
            <Detail label="Date of birth" value={w.date_of_birth ?? "—"} />
            <Detail label="Age" value={w.age ? `${w.age} years` : "—"} />
          </div>
          <Detail label="Category" value={w.category_name} />
          <Detail label="Experience" value={`${w.years_experience ?? 0} years`} />
          <Detail label="Service area" value={w.service_area ?? w.city} />
          <Detail label="Verification status" value={w.verification_status} />
          <Detail label="Joined" value={new Date(w.created_at).toLocaleDateString()} />
          <Detail label="Ghana Card #" value={w.ghana_card_number ?? "—"} />
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
  return <button onClick={onClick} className={`flex-1 whitespace-nowrap px-2 py-2 rounded-lg transition ${active ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{children}</button>;
}
function Stat({ label, value }: any) {
  return <div className="rounded-xl bg-card border border-border p-3 text-center"><p className="font-display font-bold text-xl text-primary">{value}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}

function UsersPanel({ users }: { users: any[] }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [verif, setVerif] = useState("");
  const [status, setStatus] = useState("");
  const [since, setSince] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    const query = q.trim().toLowerCase();
    if (query && !((u.full_name ?? "").toLowerCase().includes(query) || (u.email ?? "").toLowerCase().includes(query))) return false;
    if (role && !(u.roles ?? []).includes(role)) return false;
    if (verif && (u.verification_status ?? "") !== verif) return false;
    if (status === "active" && u.is_suspended) return false;
    if (status === "suspended" && !u.is_suspended) return false;
    if (since && new Date(u.created_at) < new Date(since)) return false;
    return true;
  });

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <h3 className="font-display font-bold">Users ({filtered.length})</h3>
      <div className="space-y-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="w-full rounded-xl border border-input bg-card p-2.5 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-input bg-card p-2.5 text-xs">
            <option value="">All roles</option>
            <option value="customer">Customer</option>
            <option value="worker">Worker</option>
            <option value="admin">Admin</option>
          </select>
          <select value={verif} onChange={(e) => setVerif(e.target.value)} className="rounded-xl border border-input bg-card p-2.5 text-xs">
            <option value="">Any verification</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-input bg-card p-2.5 text-xs">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="rounded-xl border border-input bg-card p-2.5 text-xs" />
        </div>
      </div>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No users match.</p>}
      {filtered.map((u) => {
        const isOpen = openId === u.user_id;
        return (
          <div key={u.user_id} className="py-2 border-t border-border first:border-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{u.full_name ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground truncate">{u.email ?? "—"} · {u.phone ?? "no phone"}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  Roles: {(u.roles ?? []).join(", ") || "—"} · Joined {new Date(u.created_at).toLocaleDateString()}
                  {u.verification_status ? ` · ${u.verification_status}` : ""}
                </p>
              </div>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${u.is_suspended ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                {u.is_suspended ? "Suspended" : "Active"}
              </span>
            </div>
            <button onClick={() => setOpenId(isOpen ? null : u.user_id)} className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-[11px] font-semibold">
              <Eye className="size-3" /> {isOpen ? "Hide" : "View"} details
            </button>
            {isOpen && (
              <div className="mt-2 rounded-xl bg-muted/40 p-3 space-y-2 text-sm">
                <Detail label="Full name" value={u.full_name} />
                <Detail label="Registration email" value={u.email ?? "—"} />
                <Detail label="Phone" value={u.phone ?? "—"} />
                <Detail label="Roles" value={(u.roles ?? []).join(", ") || "—"} />
                <Detail label="Verification status" value={u.verification_status ?? "—"} />
                <Detail label="Account status" value={u.is_suspended ? "Suspended" : "Active"} />
                <Detail label="Joined" value={new Date(u.created_at).toLocaleString()} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
