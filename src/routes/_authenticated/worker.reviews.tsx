import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/reviews")({
  head: () => ({ meta: [{ title: "My reviews — Skill Link" }] }),
  component: WorkerReviewsPage,
});

const RESOLUTION_LABEL: Record<string, string> = {
  completely: "Issue completely resolved",
  partially: "Issue partially resolved",
  not_resolved: "Issue not resolved",
};

function WorkerReviewsPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["worker-reviews", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: reviews, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("worker_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((reviews ?? []).map((r: any) => r.customer_id)));
      const map: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      }
      return (reviews ?? []).map((r: any) => ({ ...r, customer: map[r.customer_id] ?? null }));
    },
  });

  const list = data ?? [];
  const avg = list.length ? list.reduce((s: number, r: any) => s + r.rating, 0) / list.length : 0;
  const buckets = [5, 4, 3, 2, 1].map((n) => ({ n, count: list.filter((r: any) => r.rating === n).length }));

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-4 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <BackButton fallback="/worker/dashboard" className="text-primary-foreground/90 hover:text-primary-foreground mb-2" />
          <h1 className="font-display text-2xl font-bold">My reviews</h1>
          <p className="text-sm opacity-80">What customers say about your work</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="font-display text-3xl font-bold">{avg ? avg.toFixed(1) : "—"}</p>
              <div className="flex gap-0.5 justify-center">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={`size-3 ${i <= Math.round(avg) ? "fill-gold text-gold" : "text-muted-foreground/40"}`} />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{list.length} review{list.length === 1 ? "" : "s"}</p>
            </div>
            <div className="flex-1 space-y-1">
              {buckets.map((b) => (
                <div key={b.n} className="flex items-center gap-2">
                  <span className="text-[11px] w-3 text-muted-foreground">{b.n}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gold" style={{ width: `${list.length ? (b.count / list.length) * 100 : 0}%` }} />
                  </div>
                  <span className="text-[11px] w-4 text-right text-muted-foreground">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {isLoading && <div className="h-24 rounded-2xl bg-muted animate-pulse" />}
        {!isLoading && list.length === 0 && (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            No reviews yet. Complete bookings to start collecting reviews.
          </div>
        )}

        {list.map((r: any) => (
          <div key={r.id} className="rounded-2xl bg-card border border-border p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm">{r.customer?.full_name ?? "Customer"}</p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={`size-3.5 ${i <= r.rating ? "fill-gold text-gold" : "text-muted-foreground/40"}`} />
                ))}
              </div>
            </div>
            {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
            <div className="flex flex-wrap gap-1.5">
              {r.would_hire_again && <Chip>Would hire again</Chip>}
              {r.is_return_review && r.resolution && <Chip>{RESOLUTION_LABEL[r.resolution] ?? r.resolution}</Chip>}
              <span className="text-[11px] text-muted-foreground self-center">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.booking_id && (
              <Link to="/bookings/$bookingId" params={{ bookingId: r.booking_id }} className="inline-block text-xs font-semibold text-primary">
                View booking
              </Link>
            )}
          </div>
        ))}
      </main>
    </AppShell>
  );
}

function Chip({ children }: { children: any }) {
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-soft text-primary">{children}</span>;
}
