import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bookings")({
  component: BookingsPage,
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  accepted: "bg-primary-soft text-primary",
  on_the_way: "bg-primary-soft text-primary",
  in_progress: "bg-primary-soft text-primary",
  completed: "bg-success/20 text-success-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

function BookingsPage() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("bookings").select("*, categories(name), profiles!bookings_worker_id_fkey(full_name)").eq("customer_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3 mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold">My bookings</h1>
      </header>
      <main className="mx-auto max-w-md px-5 space-y-3">
        {(data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Calendar className="size-8 mx-auto text-muted-foreground mb-2"/>
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
            <Link to="/workers" className="mt-3 inline-block text-primary font-semibold text-sm">Find a pro →</Link>
          </div>
        ) : (data ?? []).map((b: any) => (
          <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{b.profiles?.full_name ?? "Worker"}</p>
              <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status]}`}>
                {b.status.replace(/_/g," ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{b.categories?.name}</p>
            <p className="text-sm mt-2 line-clamp-2">{b.description}</p>
            {b.scheduled_at && <p className="text-xs text-muted-foreground mt-2">📅 {new Date(b.scheduled_at).toLocaleString()}</p>}
            {b.estimated_cost ? <p className="text-sm font-semibold text-primary mt-1">~ GH₵{b.estimated_cost}</p> : null}
            <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              💬 Message worker
            </Link>
          </div>
        ))}
      </main>
    </AppShell>
  );
}
