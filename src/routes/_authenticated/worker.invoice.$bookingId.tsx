import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_COLUMNS } from "@/lib/booking-columns";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/invoice/$bookingId")({
  head: () => ({ meta: [{ title: "Invoice — Skill Link" }] }),
  component: InvoicePage,
});

const cedis = (n: number | null | undefined) => `GH₵${Number(n ?? 0).toLocaleString()}`;

function InvoicePage() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["worker-invoice", bookingId],
    enabled: !!user,
    queryFn: async () => {
      const { data: b } = await supabase
        .from("bookings")
        .select(`${BOOKING_COLUMNS}, categories(name)`)
        .eq("id", bookingId)
        .maybeSingle();
      if (!b) return null;
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", [b.customer_id, b.worker_id]);
      const map: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      const { data: est } = await supabase
        .from("booking_estimates")
        .select("*")
        .eq("booking_id", bookingId)
        .eq("status", "approved")
        .order("version", { ascending: false })
        .limit(1);
      return { ...b, customer: map[b.customer_id], worker: map[b.worker_id], estimate: (est ?? [])[0] ?? null } as any;
    },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!data) {
    return (
      <div className="p-8 text-center space-y-3">
        <p>Invoice not available.</p>
        <Link to="/worker/earnings" className="text-primary font-semibold">Back to earnings</Link>
      </div>
    );
  }

  const materials: any[] = Array.isArray(data.estimate?.materials) ? data.estimate.materials : [];
  const extras: any[] = Array.isArray(data.estimate?.extras) ? data.estimate.extras : [];

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="mx-auto max-w-md px-5 pt-4 print:pt-0">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <BackButton fallback="/worker/earnings" />
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold">
            <Printer className="size-3.5" /> Print / Save PDF
          </button>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <div>
            <h1 className="font-display text-xl font-bold">Skill Link invoice</h1>
            <p className="text-xs text-muted-foreground">Booking #{String(data.id).slice(0, 8).toUpperCase()}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-bold">From</p>
              <p className="font-semibold">{data.worker?.full_name ?? "Professional"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-bold">To</p>
              <p className="font-semibold">{data.customer?.full_name ?? "Customer"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Service</p>
              <p>{data.categories?.name ?? "Service"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Completed</p>
              <p>{data.payment_confirmed_at ? new Date(data.payment_confirmed_at).toLocaleDateString() : "—"}</p>
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-1.5 text-sm">
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Work</p>
            <p className="text-muted-foreground">{data.description}</p>
          </div>

          {data.estimate && (
            <div className="border-t border-border pt-3 space-y-1 text-sm">
              <Row label={data.estimate.labour_type ? `Labour — ${data.estimate.labour_type}` : "Labour"} value={cedis(data.estimate.labour_cost)} />
              {materials.map((m, i) => (
                <Row key={`m${i}`} label={`${m.name ?? "Material"} × ${m.qty ?? 1}`} value={cedis(Number(m.qty ?? 0) * Number(m.unit_price ?? 0))} />
              ))}
              {extras.map((x, i) => (
                <Row key={`x${i}`} label={x.name ?? "Extra"} value={cedis(x.amount)} />
              ))}
              {Number(data.estimate.discount) > 0 && <Row label="Discount" value={`- ${cedis(data.estimate.discount)}`} />}
              <Row label="Approved estimate" value={cedis(data.estimate.total)} />
            </div>
          )}

          <div className="border-t border-border pt-3 space-y-1 text-sm">
            <Row label="Final amount" value={cedis(data.final_amount)} />
            {data.final_amount_reason && (
              <p className="text-xs text-muted-foreground">Variance: {data.final_amount_reason}{data.final_amount_note ? ` — ${data.final_amount_note}` : ""}</p>
            )}
            <div className="flex justify-between font-display font-bold text-base pt-1">
              <span>Amount paid</span><span>{cedis(data.amount_paid)}</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            Payment is made directly between customer and professional. Skill Link records the amount for your history.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
