import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  component: AdminBookingsPage,
});

const BOOKING_STATUSES = ["all", "pending", "accepted", "on_the_way", "in_progress", "awaiting_customer_confirmation", "completed", "disputed", "cancelled", "declined"];

function AdminBookingsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [customer, setCustomer] = useState("");
  const [worker, setWorker] = useState("");
  const [date, setDate] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-bookings-page"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("bookings")
        .select("id, customer_id, worker_id, category_id, description, address, scheduled_at, estimated_cost, estimated_amount, final_amount, amount_paid, status, dispute_reason, dispute_details, disputed_at, admin_resolution_note, admin_resolved_at, completion_note, created_at, categories(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const list = rows ?? [];
      const ids = Array.from(new Set(list.flatMap((b: any) => [b.customer_id, b.worker_id].filter(Boolean))));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as any[] };
      const profiles = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((b: any) => ({
        ...b,
        customer: profiles.get(b.customer_id),
        worker: profiles.get(b.worker_id),
      }));
    },
  });

  useEffect(() => {
    const ch = supabase.channel("admin-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-bookings-page"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = useMemo(() => {
    const customerQ = customer.trim().toLowerCase();
    const workerQ = worker.trim().toLowerCase();
    return (data ?? []).filter((b: any) => {
      if (status !== "all" && b.status !== status) return false;
      if (categoryId !== "all" && b.category_id !== categoryId) return false;
      if (customerQ && !(b.customer?.full_name ?? "").toLowerCase().includes(customerQ)) return false;
      if (workerQ && !(b.worker?.full_name ?? "").toLowerCase().includes(workerQ)) return false;
      if (date) {
        const sourceDate = b.scheduled_at ?? b.created_at;
        if (!sourceDate || sourceDate.slice(0, 10) !== date) return false;
      }
      return true;
    });
  }, [data, status, categoryId, customer, worker, date]);

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-2xl font-bold mt-2">Bookings</h1>
        <p className="text-sm opacity-80">All customer bookings</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3 pb-6">
        <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-2 rounded-lg bg-muted">
              {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</option>)}
            </select>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="px-2 py-2 rounded-lg bg-muted">
              <option value="all">All categories</option>
              {(categories ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer" className="px-2 py-2 rounded-lg bg-muted" />
            <input value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="Worker" className="px-2 py-2 rounded-lg bg-muted" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-2 py-2 rounded-lg bg-muted col-span-2" />
          </div>
          <button onClick={() => refetch()} className="w-full px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading bookings…</p>
          ) : isError ? (
            <div className="text-sm">
              <p className="text-destructive">Failed to load bookings: {(error as any)?.message ?? "Unknown error"}</p>
              <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings match your filters.</p>
          ) : filtered.map((b: any) => {
            const isOpen = openId === b.id;
            return (
              <div key={b.id} className="py-3 border-t border-border first:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{b.customer?.full_name ?? "Customer"} → {b.worker?.full_name ?? "Worker"}</p>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">{String(b.status).replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{b.categories?.name ?? "—"} · {b.address ?? "No location"}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                  <span>Scheduled {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"}</span>
                  <span>{b.estimated_cost ? `GH₵${b.estimated_cost}` : "No amount"}</span>
                  <span>Created {new Date(b.created_at).toLocaleString()}</span>
                </div>
                <button onClick={() => setOpenId(isOpen ? null : b.id)} className="mt-2 text-[11px] font-semibold text-primary">
                  {isOpen ? "Hide details" : "View details"} →
                </button>
                {isOpen && (
                  <div className="mt-2 rounded-xl bg-muted/40 p-3 space-y-2">
                    <Info label="Customer" value={b.customer?.full_name ?? "—"} />
                    <Info label="Worker" value={b.worker?.full_name ?? "—"} />
                    <Info label="Service category" value={b.categories?.name ?? "—"} />
                    <Info label="Booking status" value={String(b.status).replace(/_/g, " ")} />
                    <Info label="Scheduled date and time" value={b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"} />
                    <Info label="Location / service area" value={b.address ?? "—"} />
                    <Info label="Estimated amount" value={b.estimated_amount ? `GH₵${b.estimated_amount}` : b.estimated_cost ? `GH₵${b.estimated_cost}` : "—"} />
                    <Info label="Worker final amount" value={b.final_amount ? `GH₵${b.final_amount}` : "—"} />
                    <Info label="Customer amount paid" value={b.amount_paid ? `GH₵${b.amount_paid}` : "—"} />
                    <Info label="Description" value={b.description ?? "—"} />
                    {b.completion_note && <Info label="Completion note" value={b.completion_note} />}
                    {b.status === "disputed" && (
                      <DisputePanel booking={b} onResolved={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["admin-bookings-page"] }); }} />
                    )}
                    {b.admin_resolution_note && (
                      <Info label="Admin resolution" value={`${b.admin_resolution_note} (${new Date(b.admin_resolved_at).toLocaleString()})`} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </main>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
      <p className="text-sm break-words">{value}</p>
    </div>
  );
}