import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
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
    const { error } = await supabase.from("worker_profiles").update({ verification_status: next }).eq("user_id", id);
    if (error) return toast.error(error.message);
    if (user?.id) {
      await supabase.from("admin_audit_logs").insert({
        admin_id: user.id,
        action: `worker_${next}`,
        target_user_id: id,
        target_type: "worker",
        details: { status: next },
      });
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
                      Joined {new Date(w.created_at).toLocaleDateString()} · {w.is_available ? "Available" : "Unavailable"} · Sub: {subActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0 ${w.verification_status === "approved" ? "bg-success/15 text-success" : ["rejected", "suspended"].includes(w.verification_status) ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{w.verification_status}</span>
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
      </main>
    </AppShell>
  );
}
