import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Clock, TrendingUp, CheckCircle2, Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/earnings")({
  head: () => ({ meta: [{ title: "Earnings — Skill Link" }] }),
  component: EarningsPage,
});

const cedis = (n: number | null | undefined) => `GH₵${Number(n ?? 0).toLocaleString()}`;

const PAY_LABEL: Record<string, string> = {
  not_due: "Not due",
  awaiting_confirmation: "Awaiting payment",
  confirmed: "Paid",
  disputed: "Disputed",
};

function EarningsPage() {
  const { user } = useAuth();

  const { data: summary } = useQuery({
    queryKey: ["worker-earnings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("worker_earnings_summary", { _worker_id: user!.id } as any);
      if (error) throw error;
      return (data as any)?.[0] ?? null;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["worker-payments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, description, status, payment_status, estimated_amount, final_amount, amount_paid, payment_confirmed_at, worker_completed_at, created_at, categories(name)")
        .eq("worker_id", user!.id)
        .not("status", "in", "(pending,declined,cancelled)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-4 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <BackButton fallback="/worker/dashboard" className="text-primary-foreground/90 hover:text-primary-foreground mb-2" />
          <h1 className="font-display text-2xl font-bold">Earnings</h1>
          <p className="text-sm opacity-80">Payments recorded on Skill Link</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat icon={Wallet} label="Total paid" value={cedis(summary?.total_paid)} />
          <Stat icon={Clock} label="Awaiting payment" value={cedis(summary?.awaiting_payment)} />
          <Stat icon={TrendingUp} label="This month" value={cedis(summary?.this_month)} />
          <Stat icon={CheckCircle2} label="Completed jobs" value={String(summary?.completed_jobs ?? 0)} />
        </div>

        <h2 className="font-display font-bold pt-2">Payment history</h2>
        {isLoading && <div className="h-20 rounded-2xl bg-muted animate-pulse" />}
        {!isLoading && (rows ?? []).length === 0 && (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            No payments yet. Completed bookings will appear here.
            <Link to="/jobs" className="block mt-3 text-primary font-semibold">Browse open jobs</Link>
          </div>
        )}
        {(rows ?? []).map((b: any) => (
          <div key={b.id} className="rounded-2xl bg-card border border-border p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{b.categories?.name ?? "Service"}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
              </div>
              <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-muted">
                {PAY_LABEL[b.payment_status] ?? b.payment_status}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Amount label="Estimate" value={b.estimated_amount} />
              <Amount label="Final" value={b.final_amount} />
              <Amount label="Paid" value={b.amount_paid} />
            </div>
            <div className="flex items-center gap-2">
              <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="flex-1 text-center text-xs font-semibold rounded-lg bg-muted py-2">
                View booking
              </Link>
              {b.payment_status === "confirmed" && (
                <Link to="/worker/invoice/$bookingId" params={{ bookingId: b.id }} className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold rounded-lg bg-primary text-primary-foreground py-2">
                  <Printer className="size-3.5" /> Invoice
                </Link>
              )}
            </div>
          </div>
        ))}
      </main>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3">
      <Icon className="size-4 text-primary mb-1" />
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display font-bold">{value}</p>
    </div>
  );
}
function Amount({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-muted/60 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="font-semibold">{value == null ? "—" : cedis(value)}</p>
    </div>
  );
}
