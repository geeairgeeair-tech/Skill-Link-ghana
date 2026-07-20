import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { role } = useAuth();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-users-page"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((u: any) => {
      if (roleFilter !== "all" && !(u.roles ?? []).includes(roleFilter)) return false;
      if (!s) return true;
      return [u.full_name, u.email, u.phone].filter(Boolean).some((v: string) => v.toLowerCase().includes(s));
    });
  }, [data, q, roleFilter]);

  if (role && role !== "admin") {
    return <AppShell><div className="p-8 text-center"><p>Admin access required.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-2xl font-bold mt-2">Users</h1>
        <p className="text-sm opacity-80">All accounts</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…" className="w-full px-3 py-2 rounded-lg bg-muted text-sm" />
          <div className="flex gap-1 text-xs font-semibold overflow-x-auto">
            {["all", "customer", "worker", "admin"].map((r) => (
              <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${roleFilter === r ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
            <button onClick={() => refetch()} className="px-3 py-1.5 rounded-lg bg-muted ml-auto">{isFetching ? "…" : "Refresh"}</button>
          </div>
        </div>
        <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading users…</p>
            : isError ? (
              <div className="text-sm">
                <p className="text-destructive">Failed: {(error as any)?.message}</p>
                <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Retry</button>
              </div>
            ) : filtered.length === 0 ? <p className="text-sm text-muted-foreground">No users match.</p>
            : filtered.map((u: any) => (
              <div key={u.user_id} className="py-2 border-t border-border first:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{u.full_name ?? "—"}</p>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">{(u.roles ?? []).join(", ") || "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"} · {u.phone ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString()}{u.verification_status ? ` · ${u.verification_status}` : ""}{u.is_suspended ? " · suspended" : ""}</p>
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: u.user_id }}
                  className="mt-1 inline-block px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-semibold"
                >
                  View details →
                </Link>
              </div>
            ))}
        </section>
      </main>
    </AppShell>
  );
}
