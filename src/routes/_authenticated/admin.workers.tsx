import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { VerificationBadge } from "@/components/verification-badge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/workers")({
  component: AdminWorkersPage,
});

function AdminWorkersPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-workers-page", status],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_workers", {
        _status: status === "all" ? undefined : status,
      });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter((w: any) =>
      [w.full_name, w.email, w.phone, w.category_name, w.service_area, w.city]
        .filter(Boolean).some((v: string) => v.toLowerCase().includes(s)),
    );
  }, [data, q]);

  const act = async (id: string, next: "approved" | "rejected" | "pending" | "suspended") => {
    if (next === "rejected") {
      const reason = window.prompt("Enter rejection reason (min 5 chars):");
      if (!reason || reason.trim().length < 5) return toast.error("Rejection reason is required");
      const { error } = await supabase.rpc("admin_reject_worker", { _user_id: id, _reason: reason.trim() });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("worker_profiles")
        .update({ verification_status: next, rejection_reason: null, rejected_at: null })
        .eq("user_id", id);
      if (error) return toast.error(error.message);
      if (user?.id) {
        await supabase.from("admin_audit_logs").insert({
          admin_id: user.id, action: `worker_${next}`, target_user_id: id, target_type: "worker", details: { status: next },
        });
      }
    }
    toast.success(`Worker set to ${next}`);
    qc.invalidateQueries({ queryKey: ["admin-workers-page"] });
  };

  if (role && role !== "admin") {
    return <AppShell><div className="p-8 text-center"><p>Admin access required.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-2xl font-bold mt-2">Workers</h1>
        <p className="text-sm opacity-80">Admin management</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone, category…"
            className="w-full px-3 py-2 rounded-lg bg-muted text-sm"
          />
          <div className="flex gap-1 overflow-x-auto text-xs font-semibold">
            {["all", "pending", "approved", "rejected", "suspended"].map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
            <button onClick={() => refetch()} className="px-3 py-1.5 rounded-lg bg-muted ml-auto">
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading workers…</p>
          ) : isError ? (
            <div className="text-sm">
              <p className="text-destructive">Failed to load workers: {(error as any)?.message ?? "Unknown error"}</p>
              <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workers match your filters.</p>
          ) : filtered.map((w: any) => {
            const subActive = w.subscription_expires_at && new Date(w.subscription_expires_at) > new Date();
            return (
              <div key={w.user_id} className="py-2 border-t border-border first:border-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{w.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {w.category_name ?? "—"} · {w.service_area ?? w.city ?? "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {w.email ?? "—"} · {w.phone ?? "no phone"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Joined {new Date(w.created_at).toLocaleDateString()} · Sub: {subActive ? "Active" : "Inactive"}
                    </p>
                    <p className="text-[10px] mt-0.5">
                      <span className={`uppercase font-bold px-1.5 py-0.5 rounded ${(w as any).availability_state === "available" ? "bg-success/15 text-success" : (w as any).availability_state === "busy" ? "bg-gold/20 text-gold-foreground" : "bg-muted text-muted-foreground"}`}>
                        {(w as any).availability_state === "busy" ? "Busy" : (w as any).availability_state === "unavailable" ? "Unavailable" : "Available"}
                      </span>
                      {(w as any).active_booking_id && (
                        <Link to="/bookings/$bookingId" params={{ bookingId: (w as any).active_booking_id }} className="ml-2 text-primary font-semibold">
                          View active booking
                        </Link>
                      )}
                    </p>

                  </div>
                  <VerificationBadge status={w.verification_status} className="shrink-0" />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {w.verification_status !== "approved" && (
                    <button onClick={() => act(w.user_id, "approved")} className="text-[10px] px-2 py-1 rounded bg-success text-success-foreground font-bold">
                      {["rejected", "suspended"].includes(w.verification_status) ? "Reactivate" : "Approve"}
                    </button>
                  )}
                  {w.verification_status === "approved" && (
                    <button onClick={() => act(w.user_id, "suspended")} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Suspend</button>
                  )}
                  {w.verification_status === "pending" && (
                    <button onClick={() => act(w.user_id, "rejected")} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Reject</button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <ExpiringDocumentsPanel />

        <ProfessionsReviewPanel />

        <EquipmentReviewPanel />



      </main>
    </AppShell>
  );
}

function ExpiringDocumentsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-expiring-docs"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_expiring_documents", { _within_days: 30 });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const request = async (userId: string) => {
    const reason = window.prompt("What should the worker update? (shown to them)") ?? "";
    const { error } = await (supabase.rpc as any)("admin_request_document_resubmission", { _user_id: userId, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Worker notified");
    qc.invalidateQueries({ queryKey: ["admin-expiring-docs"] });
  };

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
      <h2 className="font-display font-bold">Documents expiring or expired</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents expiring in the next 30 days.</p>
      ) : (data ?? []).map((r: any) => (
        <div key={r.user_id} className="py-2 border-t border-border first:border-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{r.full_name ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.days_left <= 0 ? "Expired" : `${r.days_left} day(s) left`} · {new Date(r.documents_expire_at).toLocaleDateString()}
              {r.resubmission_requested_at ? " · resubmission requested" : ""}
            </p>
          </div>
          <button onClick={() => request(r.user_id)} className="shrink-0 text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground font-bold">
            Request update
          </button>
        </div>
      ))}
    </section>
  );
}

function ProfessionsReviewPanel() {

  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-professions-pending"],
    queryFn: async () => {
      const { data } = await supabase.from("worker_professions")
        .select("*, categories(name)")
        .eq("verification_status", "pending")
        .eq("is_primary", false)
        .order("submitted_at", { ascending: true });
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
      let map: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      }
      return rows.map((r: any) => ({ ...r, profile: map[r.user_id] ?? null }));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-professions-pending")
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_professions" },
        () => qc.invalidateQueries({ queryKey: ["admin-professions-pending"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const approve = async (id: string) => {
    const { error } = await supabase.rpc("admin_approve_profession", { _profession_id: id });
    if (error) return toast.error(error.message);
    toast.success("Profession approved");
    qc.invalidateQueries({ queryKey: ["admin-professions-pending"] });
  };
  const reject = async (id: string) => {
    const reason = window.prompt("Reason (min 5 chars):");
    if (!reason || reason.trim().length < 5) return toast.error("Reason required");
    const { error } = await supabase.rpc("admin_reject_profession", { _profession_id: id, _reason: reason.trim() });
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    qc.invalidateQueries({ queryKey: ["admin-professions-pending"] });
  };

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold">Additional professions to verify</h3>
        <button onClick={() => refetch()} className="text-xs text-primary font-semibold">Refresh</button>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : (data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing pending.</p>
        : (data ?? []).map((p: any) => (
          <div key={p.id} className="py-2 border-t border-border first:border-0">
            <p className="text-sm font-semibold">{p.profile?.full_name ?? "Worker"} — {p.categories?.name}</p>
            <p className="text-xs text-muted-foreground">{p.years_experience} yrs · Submitted {new Date(p.submitted_at ?? p.created_at).toLocaleDateString()}</p>
            {p.bio && <p className="text-xs mt-1 text-foreground/80 line-clamp-3">{p.bio}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={() => approve(p.id)} className="text-[10px] px-2 py-1 rounded bg-success text-success-foreground font-bold">Approve</button>
              <button onClick={() => reject(p.id)} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Reject</button>
            </div>
          </div>
        ))}
    </section>
  );
}

function EquipmentReviewPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-equipment-pending"],
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_professions")
        .select("id, user_id, equipment_images, equipment_status, updated_at, categories(name)")
        .eq("equipment_status", "pending")
        .order("updated_at", { ascending: true });
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
      const map: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      }
      return await Promise.all(
        rows.map(async (r: any) => ({
          ...r,
          profile: map[r.user_id] ?? null,
          shots: await signMedia(toMediaRefs(r.equipment_images, "worker-docs")),
        })),
      );
    },
  });

  const review = async (id: string, approve: boolean) => {
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt("Why is the equipment rejected? (min 5 chars)");
      if (!reason || reason.trim().length < 5) return toast.error("Reason required");
    }
    const { error } = await (supabase.rpc as any)("admin_review_equipment", {
      _profession_id: id, _approve: approve, _reason: reason?.trim() ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success(approve ? "Equipment verified" : "Equipment rejected");
    qc.invalidateQueries({ queryKey: ["admin-equipment-pending"] });
  };

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold">Equipment to verify</h3>
        <button onClick={() => refetch()} className="text-xs text-primary font-semibold">Refresh</button>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : (data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No equipment awaiting review.</p>
        : (data ?? []).map((r: any) => (
          <div key={r.id} className="py-2 border-t border-border first:border-0">
            <p className="text-sm font-semibold">{r.profile?.full_name ?? "Worker"} — {r.categories?.name}</p>
            <p className="text-[11px] text-muted-foreground">{r.shots.length} photo(s) · updated {new Date(r.updated_at).toLocaleDateString()}</p>
            {r.shots.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {r.shots.map((s: any) => (
                  <a key={s.path} href={s.url} target="_blank" rel="noreferrer">
                    <img src={s.url} alt="Equipment" className="w-full aspect-square object-cover rounded-lg border border-border" />
                  </a>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button onClick={() => review(r.id, true)} className="text-[10px] px-2 py-1 rounded bg-success text-success-foreground font-bold">Approve equipment</button>
              <button onClick={() => review(r.id, false)} className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground font-bold">Reject</button>
            </div>
          </div>
        ))}
    </section>
  );
}
