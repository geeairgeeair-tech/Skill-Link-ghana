import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uniqueChannel } from "@/lib/realtime";
import { AppShell } from "@/components/app-shell";
import { CustomerMarketplaceSection } from "@/components/customer-marketplace";
import { PageSkeleton } from "@/components/page-skeleton";

import { useAuth } from "@/hooks/use-auth";
import { fetchWorkerCoverage } from "@/lib/service-areas";
import { jobDurationLabel, windowInfo, bookingTimingLines } from "@/lib/job-timing";
import {
  BadgeCheck, AlertCircle, LifeBuoy, RefreshCw, Briefcase, CalendarDays, FileText,
  Wallet, Star, Layers, RotateCcw, UserCog, MapPin, CalendarClock,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/worker/dashboard")({
  head: () => ({ meta: [{ title: "Worker dashboard — Skill Link" }] }),
  component: WorkerDashboard,
});

const ACTIVE = ["accepted", "on_the_way", "arrived", "in_progress", "awaiting_customer_confirmation", "disputed"];
/** ONE definition of "unresolved accepted commitment" — mirrors public.commitment_statuses(). */
const COMMITMENT_STATUSES = [
  "accepted", "on_the_way", "arrived", "in_progress", "awaiting_customer_confirmation",
  "worker_on_the_way", "work_started", "worker_marked_complete", "disputed",
] as const;
const cedis = (n: any) => `GH₵${Number(n ?? 0).toLocaleString()}`;
const isToday = (d?: string | null) => !!d && new Date(d).toDateString() === new Date().toDateString();
const COMPLETED_STATUSES = ["completed", "closed", "customer_confirmed_complete"];


function WorkerDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: coverage, isLoading: coverageLoading } = useQuery({
    queryKey: ["my-service-areas", user?.id],
    enabled: !!user,
    queryFn: () => fetchWorkerCoverage(user!.id),
  });
  const hasCoverage = !!coverage?.primaryId;

  const { data: wp, isLoading: wpLoading } = useQuery({
    queryKey: ["my-worker-profile", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select(
          "user_id, category_id, bio, years_experience, city, service_area, hourly_rate, callout_fee, starting_price, portfolio_images, verification_status, rating, reviews_count, jobs_completed, is_featured, is_available, unavailable_note, created_at, updated_at",
        )
        .eq("user_id", user!.id).maybeSingle();
      if (!data) return null;
      const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: user!.id });
      const row: any = (ident as any)?.[0] ?? {};
      return { ...data, date_of_birth: row.date_of_birth ?? null, ghana_card_url: row.ghana_card_url ?? null, selfie_url: row.selfie_url ?? null } as any;
    },
  });


  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ["worker-bookings", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("bookings")
        .select("id, status, description, budget, estimated_cost, scheduled_at, timing_type, preferred_window, duration_type, duration_start_date, duration_end_date, created_at, customer_id, worker_completed_at, customer_confirmed_at, categories(name)")
        .eq("worker_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean)));
      const map: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      }
      return (rows ?? []).map((r: any) => ({ ...r, profiles: map[r.customer_id] ?? null }));
    },
  });

  const { data: applications } = useQuery({
    queryKey: ["worker-app-count", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => (await supabase.from("job_applications").select("id, status").eq("worker_id", user!.id)).data ?? [],
  });

  const { data: myProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile-name", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await supabase.from("profiles").select("full_name, avatar_url").eq("id", user!.id).maybeSingle()).data,
  });



  const { data: returns } = useQuery({
    queryKey: ["worker-returns", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => (await supabase.from("return_requests").select("*").eq("worker_id", user!.id)
      .in("status", ["pending", "info_requested", "scheduled", "accepted"]).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: earnings } = useQuery({
    queryKey: ["worker-earnings", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("worker_earnings_summary", { _worker_id: user!.id } as any);
      return (data as any)?.[0] ?? null;
    },
  });

  /** The single unresolved accepted commitment (upcoming scheduled OR current) + its job details. */
  const { data: commitment } = useQuery({
    queryKey: ["worker-commitment", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: b } = await supabase
        .from("bookings")
        .select("id, status, scheduled_at, timing_type, preferred_window, duration_type, duration_start_date, duration_end_date, service_area, description, categories(name)")
        .eq("worker_id", user!.id)
        .in("status", COMMITMENT_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!b) return null;
      const { data: jr } = await supabase
        .from("job_requests")
        .select("preferred_window, duration_type, duration_start_date, duration_end_date")
        .eq("booking_id", b.id)
        .maybeSingle();
      return { ...(b as any), job: jr ?? null };
    },
  });

  const { data: tickets } = useQuery({
    queryKey: ["worker-tickets", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => (await supabase.from("support_tickets").select("id, status").eq("user_id", user!.id)).data ?? [],
  });


  useEffect(() => {
    if (!user) return;
    const channel = uniqueChannel(`worker-dash:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["worker-bookings", user.id] });
          qc.invalidateQueries({ queryKey: ["worker-commitment", user.id] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "return_requests", filter: `worker_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["worker-returns", user.id] }))
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

  const list = bookings ?? [];
  const status = (wp as any)?.verification_status;
  const isVerified = status === "approved";
  const available = (wp as any)?.is_available ?? true;
  const activeList = list.filter((b: any) => ACTIVE.includes(b.status));
  const busy = activeList.length > 0;
  const pendingRequests = list.filter((b: any) => b.status === "pending");
  /** Jobs actually finished today — derived from completion timestamps, so it resets itself each day. */
  const todayJobs = list.filter(
    (b: any) => COMPLETED_STATUSES.includes(b.status) && (isToday(b.customer_confirmed_at) || isToday(b.worker_completed_at)),
  );
  const liveJobs = activeList;
  const completed = list.filter((b: any) => COMPLETED_STATUSES.includes(b.status)).length;
  const pendingApps = (applications ?? []).filter((a: any) => a.status === "pending").length;
  const openTickets = (tickets ?? []).filter((t: any) => t.status !== "closed" && t.status !== "resolved").length;

  const completion = (() => {
    if (!wp) return 0;
    const checks = [
      !!(wp as any).bio, !!(wp as any).category_id, !!(wp as any).service_area,
      !!(wp as any).date_of_birth, !!(wp as any).ghana_card_url, !!(wp as any).selfie_url,
      Array.isArray((wp as any).portfolio_images) && (wp as any).portfolio_images.length > 0,
      !!(wp as any).starting_price,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  // Never render customer / unverified content while the professional record is still loading.
  if (wpLoading || profileLoading) return <PageSkeleton rows={5} />;

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-12 shrink-0 rounded-2xl bg-primary-foreground/15 overflow-hidden grid place-items-center font-bold text-lg">
            {myProfile?.avatar_url
              ? <img src={myProfile.avatar_url} alt={myProfile?.full_name ?? "Worker"} className="size-full object-cover" />
              : (myProfile?.full_name?.[0]?.toUpperCase() ?? "?")}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold truncate">{myProfile?.full_name || "Worker"}</h1>
            <p className="text-primary-foreground/80 text-sm">Manage your jobs & profile</p>
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-md px-5 mt-5 space-y-4">
        {wp && isVerified && (
          <div className="rounded-2xl bg-success/15 border border-success/30 p-3 text-sm font-semibold inline-flex items-center gap-2">
            <BadgeCheck className="size-4 text-success" /> Your account is verified.
          </div>
        )}

        {wp && !coverageLoading && !hasCoverage && (
          <Link to="/worker/profile" className="block rounded-2xl bg-warning/15 border border-warning/30 p-4">
            <div className="flex items-center gap-3">
              <MapPin className="size-5" />
              <div>
                <p className="font-bold">Set your service areas</p>
                <p className="text-xs text-muted-foreground">Tell customers where you work — 1 primary area plus up to 7 more.</p>
              </div>
            </div>
          </Link>
        )}

        {!wp && (
          <Link to="/worker/onboarding" className="block rounded-2xl bg-gold text-gold-foreground p-4 shadow-elevated">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-6" />
              <div><p className="font-bold">Complete your profile</p><p className="text-xs">Add your skills, ID & verification.</p></div>
            </div>
          </Link>
        )}


        {wp && status === "rejected" && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 space-y-2">
            <p className="font-semibold inline-flex items-center gap-2 text-destructive"><AlertCircle className="size-4" /> Your verification was not approved. Review the reason below and resubmit.</p>
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
                <RefreshCw className="size-3" /> Resubmit
              </button>
              <Link to="/support" className="text-xs px-3 py-1.5 rounded-lg bg-muted font-semibold inline-flex items-center gap-1">
                <LifeBuoy className="size-3" /> Contact support
              </Link>
            </div>
          </div>
        )}

        {wp && status === "suspended" && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 space-y-2">
            <p className="font-semibold inline-flex items-center gap-2 text-destructive"><AlertCircle className="size-4" /> Your Professional account has been suspended. Please contact Support.</p>
            <Link to="/support" className="text-xs px-3 py-1.5 rounded-lg bg-muted font-semibold inline-flex items-center gap-1">
              <LifeBuoy className="size-3" /> Contact support
            </Link>
          </div>
        )}

        {wp && !isVerified && status !== "rejected" && status !== "suspended" && (
          <div className="rounded-2xl bg-warning/15 border border-warning/30 p-4">
            <p className="font-semibold inline-flex items-center gap-1"><AlertCircle className="size-4" /> Verification under review</p>
            <p className="text-sm text-muted-foreground mt-1">Your Professional verification is under review. You can continue setting up your profile while waiting.</p>
          </div>
        )}




        {wp && completion < 100 && (
          <Link to="/worker/profile" className="block rounded-2xl bg-card border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-sm">Profile completion</p>
              <span className="text-xs font-bold text-primary">{completion}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${completion}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Complete your profile to win more jobs.</p>
          </Link>
        )}

        {wp && (
          <div className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="font-display font-bold flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${busy ? "bg-warning" : available ? "bg-success animate-pulse" : "bg-muted-foreground/50"}`} />
                {busy ? "Currently busy" : available ? "Active" : "Unavailable"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {busy ? "You have an active booking in progress."
                  : available ? "Customers can see and book you right now."
                  : "You're hidden from search until you turn this back on."}
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

        {commitment && <CommitmentCard c={commitment} />}

        {(returns ?? []).length > 0 && (
          <div className="rounded-2xl bg-gold/15 border border-gold/40 p-4 space-y-2">
            <p className="font-semibold inline-flex items-center gap-2"><RotateCcw className="size-4" /> Return job requests</p>
            {(returns ?? []).map((r: any) => (
              <Link key={r.id} to="/bookings/$bookingId" params={{ bookingId: r.booking_id }} className="block rounded-xl bg-card border border-border p-3">
                <p className="text-sm line-clamp-2">{r.reason}</p>
                <p className="text-[11px] text-muted-foreground mt-1 capitalize">{String(r.status).replace(/_/g, " ")} · {new Date(r.created_at).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-display font-bold">New booking requests</h2>
            {pendingRequests.map((b: any) => <BookingRow key={b.id} b={b} />)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <StatTile to="/worker/jobs" icon={CalendarDays} label="Today's jobs" value={todayJobs.length} />
          <StatTile to="/worker/applications" icon={FileText} label="Pending applications" value={pendingApps} />
          <StatTile to="/worker/earnings" icon={Wallet} label="Total earned" value={cedis(earnings?.total_paid)} />
          <StatTile to="/worker/reviews" icon={Star} label="Rating" value={(wp as any)?.rating ? `${(wp as any).rating} ★` : "—"} />
          <StatTile to="/worker/jobs" icon={BadgeCheck} label="Completed jobs" value={completed} />
          <StatTile to="/support" icon={LifeBuoy} label="Open tickets" value={openTickets} />
        </div>

        {bookingsLoading && <div className="h-24 rounded-2xl bg-muted animate-pulse" />}

        {liveJobs.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-display font-bold">Active jobs</h2>
            {liveJobs.map((b: any) => <BookingRow key={b.id} b={b} />)}
          </div>
        )}


        <div className="grid grid-cols-2 gap-2 pb-4">
          <Tile to="/worker/profile" icon={UserCog} title="My profile" subtitle="Bio, pricing, documents" />
          <Tile to="/worker/professions" icon={Layers} title="My professions" subtitle="Up to 3 verified skills" />
          <Tile to="/jobs" icon={Briefcase} title="Browse jobs" subtitle="Find new work" />
          <Tile to="/support" icon={LifeBuoy} title="Support" subtitle="Get help fast" />
        </div>

        <div className="pt-2 border-t border-border pb-4">
          <CustomerMarketplaceSection />
        </div>
      </main>

    </AppShell>
  );
}

function CommitmentCard({ c }: { c: any }) {
  const scheduled = c.scheduled_at ? new Date(c.scheduled_at) : null;
  const upcoming = !!scheduled && scheduled.getTime() > Date.now() && c.status === "accepted";
  const w = windowInfo(c.job?.preferred_window);
  const duration = c.job ? jobDurationLabel(c.job) : null;
  return (
    <Link
      to="/bookings/$bookingId"
      params={{ bookingId: c.id }}
      className="block rounded-2xl bg-primary-soft border border-primary/30 p-4"
    >
      <p className="font-display font-bold inline-flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        {upcoming ? "Upcoming scheduled booking" : "Current commitment"}
      </p>
      <p className="font-semibold mt-1 truncate">{c.categories?.name ?? "Service"}</p>
      <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        {c.service_area && <p>📍 {c.service_area}</p>}
        {scheduled && (
          <p>
            🗓 {scheduled.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            {w ? ` • ${w.label} (${w.range})` : ` • ${scheduled.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
          </p>
        )}
        {duration && <p>{duration.text}</p>}
        <p className="capitalize font-semibold text-primary">{String(c.status).replace(/_/g, " ")}</p>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        You're reserved for this booking. Complete or resolve it before taking new work.
      </p>
    </Link>
  );
}

function BookingRow({ b }: { b: any }) {
  return (
    <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="block rounded-2xl bg-card border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{b.categories?.name ?? "Service"}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
          {(b.budget ?? b.estimated_cost) != null && (
            <p className="text-[11px] font-semibold text-primary mt-1">
              Customer Budget: GH₵{Number(b.budget ?? b.estimated_cost).toLocaleString("en-GH")}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">
            {b.profiles?.full_name ?? "Customer"}
            {b.scheduled_at ? ` · ${new Date(b.scheduled_at).toLocaleString()}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary-soft text-primary">
          {String(b.status).replace(/_/g, " ")}
        </span>
      </div>

    </Link>
  );
}

function StatTile({ to, icon: Icon, label, value }: any) {
  return (
    <Link to={to} className="rounded-2xl bg-card border border-border p-3">
      <Icon className="size-4 text-primary mb-1" />
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display font-bold">{value}</p>
    </Link>
  );
}
function Tile({ to, icon: Icon, title, subtitle }: any) {
  return (
    <Link to={to} className="rounded-2xl bg-card border border-border p-4">
      <Icon className="size-5 text-primary mb-1" />
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
    </Link>
  );
}
