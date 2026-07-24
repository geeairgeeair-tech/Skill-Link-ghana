import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { BadgeCheck, AlertCircle, MessageCircle, LifeBuoy, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/dashboard")({
  component: WorkerDashboard,
});

function WorkerDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: wp } = useQuery({
    queryKey: ["my-worker-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("worker_profiles").select("user_id, category_id, bio, years_experience, service_area, city, hourly_rate, callout_fee, starting_price, portfolio_images, verification_status, subscription_plan, subscription_expires_at, rating, reviews_count, jobs_completed, is_available, unavailable_note, is_featured, phone_verified, rejection_reason, rejected_at, created_at, updated_at").eq("user_id", user!.id).maybeSingle();
      if (!data) return null;
      const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: user!.id });
      const dob = (ident as any)?.[0]?.date_of_birth ?? null;
      return { ...data, date_of_birth: dob } as any;
    },
  });
  const { data: bookings, isLoading: bookingsLoading, error: bookingsError, refetch: refetchBookings } = useQuery({
    queryKey: ["worker-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("bookings")
        .select("*, categories(name)")
        .eq("worker_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean)));
      let profMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      }
      return (rows ?? []).map((r: any) => ({ ...r, profiles: profMap[r.customer_id] ?? null }));
    },
  });

  // Realtime: refresh when new bookings arrive for this worker
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`worker-bookings:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ["worker-bookings", user.id] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const toggleAvailable = async (next: boolean) => {
    if (!user) return;
    const { error } = await supabase.from("worker_profiles").update({ is_available: next } as any).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "You're available for jobs" : "Marked unavailable");
    qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
  };

  const isVerified = (wp as any)?.verification_status === "approved";
  const isSubscribed = true; // Free beta: all approved workers have marketplace access
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
        {wp && (wp as any).verification_status === "rejected" && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 space-y-2">
            <p className="font-semibold inline-flex items-center gap-2 text-destructive"><AlertCircle className="size-4"/> Your verification was not approved.</p>
            {(wp as any).rejection_reason && (
              <div className="rounded-lg bg-card border border-border p-2 text-sm">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Reason from admin</p>
                <p>{(wp as any).rejection_reason}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Link to="/worker/onboarding" className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold">Update profile</Link>
              <button
                onClick={async () => {
                  const { error } = await supabase.rpc("worker_resubmit_verification");
                  if (error) return toast.error(error.message);
                  toast.success("Resubmitted for verification");
                  qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-gold text-gold-foreground font-semibold inline-flex items-center gap-1"
              >
                <RefreshCw className="size-3"/> Resubmit for verification
              </button>
              <Link to="/support" className="text-xs px-3 py-1.5 rounded-lg bg-muted font-semibold inline-flex items-center gap-1">
                <LifeBuoy className="size-3"/> Contact support
              </Link>
            </div>
          </div>
        )}
        {wp && !isVerified && (wp as any).verification_status !== "rejected" && (
          <div className="rounded-2xl bg-warning/15 border border-warning/30 p-4">
            <p className="font-semibold inline-flex items-center gap-1"><AlertCircle className="size-4"/> Awaiting verification</p>
            <p className="text-sm text-muted-foreground mt-1">Your account is pending admin approval.</p>
          </div>
        )}
        {wp && !(wp as any).date_of_birth && (
          <div className="rounded-2xl bg-gold/20 border border-gold/40 p-4">
            <p className="font-semibold inline-flex items-center gap-1"><AlertCircle className="size-4"/> Complete your date of birth</p>
            <p className="text-sm text-muted-foreground mt-1">Your date of birth is required before verification can continue. It stays private.</p>
            <Link to="/worker/onboarding" className="mt-2 inline-block text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold">Update information</Link>
          </div>
        )}
        {wp && isVerified && isSubscribed && (
          <div className="rounded-2xl bg-success/15 border border-success/30 p-3 text-sm font-semibold inline-flex items-center gap-2">
            <BadgeCheck className="size-4 text-success"/> Free Beta Access — you're live in the marketplace
          </div>
        )}

        {wp && (
          <div className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="font-display font-bold flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${available ? "bg-success animate-pulse" : "bg-muted-foreground/50"}`} />
                {available ? "Active" : "Unavailable"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {available ? "Customers can see and book you right now." : "You're hidden from search until you turn this back on."}
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

        <Link to="/worker/professions" className="block rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display font-bold">My professions</p>
              <p className="text-xs text-muted-foreground">Add up to 3 verified skills</p>
            </div>
            <span className="text-primary font-semibold text-sm">Manage →</span>
          </div>
        </Link>

        <section className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold">Recent bookings</h3>
            <Link to="/worker/jobs" className="text-xs font-semibold text-primary">View all →</Link>
          </div>
          {bookingsLoading ? (
            <p className="text-sm text-muted-foreground">Loading bookings…</p>
          ) : bookingsError ? (
            <div className="text-sm">
              <p className="text-destructive">Couldn't load bookings.</p>
              <button onClick={() => refetchBookings()} className="mt-2 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">Retry</button>
            </div>
          ) : (bookings ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (bookings ?? []).slice(0, 5).map((b: any) => (
            <div key={b.id} className="py-3 border-t border-border first:border-0">
              <div className="flex items-start gap-3">
                <div className="size-10 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-sm">
                  {b.profiles?.avatar_url
                    ? <img src={b.profiles.avatar_url} alt="" className="size-full object-cover"/>
                    : (b.profiles?.full_name?.[0] ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{b.profiles?.full_name ?? "Customer"}</p>
                      <p className="text-xs text-muted-foreground">{b.categories?.name ?? "Service"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap">{b.status.replace(/_/g, " ")}</span>
                      {b.urgency === "urgent" && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gold text-gold-foreground">Urgent</span>}
                      {b.urgency === "emergency" && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground">Emergency</span>}
                    </div>
                  </div>
                  <p className="text-xs mt-1 line-clamp-2 text-foreground/80">{b.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                    {b.scheduled_at && <span>📅 {new Date(b.scheduled_at).toLocaleString()}</span>}
                    {b.service_area && <span>📍 {b.service_area}</span>}
                    {b.budget ? <span className="font-semibold text-primary">GH₵{b.budget}</span> : null}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="text-[11px] px-2.5 py-1 rounded-full bg-muted font-semibold inline-flex items-center gap-1">
                      <MessageCircle className="size-3"/> Chat
                    </Link>
                    <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="text-[11px] px-2.5 py-1 rounded-full bg-primary text-primary-foreground font-semibold">View details →</Link>
                  </div>
                </div>
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
