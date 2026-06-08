import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { BadgeCheck, AlertCircle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/dashboard")({
  component: WorkerDashboard,
});

function WorkerDashboard() {
  const { user } = useAuth();
  const { data: wp } = useQuery({
    queryKey: ["my-worker-profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("worker_profiles").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });
  const { data: bookings } = useQuery({
    queryKey: ["worker-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("bookings").select("*, profiles!bookings_customer_id_fkey(full_name)").eq("worker_id", user!.id).order("created_at",{ascending:false})).data ?? [],
  });

  const isVerified = (wp as any)?.verification_status === "approved";
  const isSubscribed = (wp as any)?.subscription_expires_at && new Date((wp as any).subscription_expires_at) > new Date();
  const stats = (bookings ?? []).reduce((acc:any, b:any) => {
    acc.total++;
    if (b.status === "pending") acc.pending++;
    if (b.status === "completed") acc.completed++;
    return acc;
  }, { total: 0, pending: 0, completed: 0 });

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-2xl font-bold">Worker dashboard</h1>
          <p className="text-primary-foreground/80 text-sm">Manage your jobs & profile</p>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-4">
        {!wp && (
          <Link to="/worker/onboarding" className="block rounded-2xl bg-gold text-gold-foreground p-4 shadow-elevated">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-6"/>
              <div><p className="font-bold">Complete your profile</p><p className="text-xs">Add your skills, ID & verification.</p></div>
            </div>
          </Link>
        )}
        {wp && !isVerified && (
          <div className="rounded-2xl bg-warning/15 border border-warning/30 p-4">
            <p className="font-semibold inline-flex items-center gap-1"><AlertCircle className="size-4"/> Awaiting verification</p>
            <p className="text-sm text-muted-foreground mt-1">Your account is pending admin approval.</p>
          </div>
        )}
        {wp && isVerified && !isSubscribed && (
          <Link to="/worker/subscription" className="block rounded-2xl bg-primary text-primary-foreground p-4 shadow-elevated">
            <div className="flex items-center gap-3">
              <Sparkles className="size-6"/>
              <div><p className="font-bold">Activate subscription</p><p className="text-xs opacity-90">Required to appear in search & receive jobs.</p></div>
            </div>
          </Link>
        )}
        {wp && isVerified && isSubscribed && (
          <div className="rounded-2xl bg-success/15 border border-success/30 p-3 text-sm font-semibold inline-flex items-center gap-2">
            <BadgeCheck className="size-4 text-success"/> Verified & active
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total" value={stats.total} />
          <Stat label="Pending" value={stats.pending} />
          <Stat label="Done" value={stats.completed} />
        </div>

        <section className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-display font-bold mb-3">Recent bookings</h3>
          {(bookings ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (bookings ?? []).slice(0,5).map((b:any) => (
            <div key={b.id} className="flex items-center justify-between py-2 border-t border-border first:border-0">
              <div>
                <p className="font-semibold text-sm">{b.profiles?.full_name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{b.description}</p>
              </div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground">{b.status}</span>
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
function Stat({ label, value }: any) {
  return <div className="rounded-xl bg-card border border-border p-3 text-center"><p className="font-display font-bold text-2xl text-primary">{value}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}
