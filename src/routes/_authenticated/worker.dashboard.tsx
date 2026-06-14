import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { BadgeCheck, AlertCircle, Sparkles, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/dashboard")({
  component: WorkerDashboard,
});

function WorkerDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: wp } = useQuery({
    queryKey: ["my-worker-profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("worker_profiles").select("user_id, category_id, bio, years_experience, service_area, city, hourly_rate, callout_fee, starting_price, portfolio_images, verification_status, subscription_plan, subscription_expires_at, rating, reviews_count, jobs_completed, is_available, unavailable_note, is_featured, phone_verified, created_at, updated_at").eq("user_id", user!.id).maybeSingle()).data,
  });
  const { data: bookings } = useQuery({
    queryKey: ["worker-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("bookings").select("*, profiles!bookings_customer_id_fkey(full_name)").eq("worker_id", user!.id).order("created_at",{ascending:false})).data ?? [],
  });

  const toggleAvailable = async (next: boolean) => {
    if (!user) return;
    const { error } = await supabase.from("worker_profiles").update({ is_available: next } as any).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "You're available for jobs" : "Marked unavailable");
    qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
  };

  const isVerified = (wp as any)?.verification_status === "approved";
  const isSubscribed = (wp as any)?.subscription_expires_at && new Date((wp as any).subscription_expires_at) > new Date();
  const available = (wp as any)?.is_available ?? true;
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

        {wp && (
          <div className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="font-display font-bold flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${available ? "bg-success" : "bg-muted-foreground/50"}`} />
                {available ? "Available" : "Unavailable"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {available ? "Customers can see and book you." : "You're hidden from search until you turn this on."}
              </p>
            </div>
            <button
              onClick={() => toggleAvailable(!available)}
              className={`relative w-14 h-8 shrink-0 rounded-full transition-colors ${available ? "bg-success" : "bg-muted-foreground/30"}`}
              aria-label="Toggle availability"
            >
              <span className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${available ? "translate-x-6" : ""}`} />
            </button>
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
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{b.profiles?.full_name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{b.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="size-8 grid place-items-center rounded-full bg-muted" aria-label="Chat">
                  <MessageCircle className="size-4"/>
                </Link>
                <span className="text-[10px] uppercase font-bold text-muted-foreground">{b.status}</span>
              </div>
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
