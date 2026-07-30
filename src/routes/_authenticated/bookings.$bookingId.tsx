import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  MapPin, Calendar, Wallet, MessageCircle, User, BadgeCheck, Phone,
  CheckCircle2, XCircle, AlertTriangle, Clock, ArrowRight, ShieldCheck,
  Navigation, LifeBuoy, Gavel, Image as ImageIcon, Truck, Flag, PlayCircle,
  UserCheck, Scale,
} from "lucide-react";

import { BackButton } from "@/components/back-button";
import { LocationMap } from "@/components/location-map";
import { EstimateSection } from "@/components/booking-estimate";
import { CompleteJobModal } from "@/components/complete-job-modal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/bookings/$bookingId")({
  component: BookingDetail,
});

const fmtGHS = (n: number | null | undefined) =>
  n == null ? "—" : `GH₵${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function statusLabel(s: string): string {
  return s.replace(/_/g, " ");
}

const DISPUTE_REASONS = [
  { code: "not_completed", label: "Work not completed" },
  { code: "quality", label: "Work quality problem" },
  { code: "amount", label: "Amount disagreement" },
  { code: "no_show", label: "Worker did not attend" },
  { code: "damage", label: "Damage or safety concern" },
  { code: "other", label: "Other" },
];

const ENDED = ["completed", "closed", "customer_confirmed_complete", "cancelled", "declined"];

function professionRankLabel(rank: number | null): string | null {
  if (rank == null) return null;
  return rank === 1 ? "Primary profession" : rank === 2 ? "Second profession" : rank === 3 ? "Third profession" : `Profession ${rank}`;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

function BookingSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="fg-gradient-hero px-5 pt-5 pb-8 rounded-b-3xl">
        <Skeleton className="h-4 w-24 bg-white/30" />
        <Skeleton className="h-6 w-48 mt-4 bg-white/30" />
        <Skeleton className="h-3 w-32 mt-2 bg-white/20" />
      </div>
      <main className="mx-auto max-w-2xl px-5 -mt-3 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-background grid place-items-center px-6">
      <div className="text-center space-y-3 max-w-sm">
        <AlertTriangle className="size-8 text-destructive mx-auto" />
        <p className="font-display font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link to="/bookings" className="inline-block text-primary font-semibold">Back to bookings</Link>
      </div>
    </div>
  );
}

/** Dispute progress states shown when a booking is disputed. */
function disputeStage(b: any): { key: string; label: string }[] {
  const stages = [
    { key: "open", label: "Dispute Open", done: !!b.disputed_at },
    { key: "admin", label: "Admin Assigned", done: !!b.admin_review_requested_at || !!b.admin_resolved_at },
    { key: "evidence_req", label: "Evidence Requested", done: !!b.admin_review_requested_at },
    { key: "evidence_sub", label: "Evidence Submitted", done: !!b.completion_note || (Array.isArray(b.photos) && b.photos.length > 0) },
    { key: "awaiting", label: "Awaiting Decision", done: !b.admin_resolved_at },
    { key: "resolved", label: "Resolved", done: !!b.admin_resolved_at },
  ];
  return stages.filter((s) => s.done).map(({ key, label }) => ({ key, label }));
}

function BookingDetail() {
  const { bookingId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showDispute, setShowDispute] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-detail", bookingId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: b, error } = await supabase
        .from("bookings")
        .select("*, categories(id, name)")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      if (!b) return null;
      const partnerId = (b as any).customer_id === user!.id ? (b as any).worker_id : (b as any).customer_id;
      const [{ data: parties }, { data: contact }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", [(b as any).customer_id, (b as any).worker_id]),
        supabase.rpc("get_profile_contact", { _id: partnerId }),
      ]);
      const byId = new Map((parties ?? []).map((p: any) => [p.id, p]));

      const [{ data: wp }, { data: profs }] = await Promise.all([
        supabase
          .from("worker_profiles")
          .select("rating, reviews_count, jobs_completed, verification_status, is_available, unavailable_note")
          .eq("user_id", (b as any).worker_id).maybeSingle(),
        supabase
          .from("worker_professions")
          .select("category_id, is_primary, verification_status, created_at, categories(name)")
          .eq("user_id", (b as any).worker_id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),
      ]);

      let workerStatus: string | null = null;
      const { data: ws } = await supabase.rpc("get_worker_public_status", { _worker_id: (b as any).worker_id });
      workerStatus = (ws as any) ?? null;

      const list = profs ?? [];
      const idx = list.findIndex((p: any) => p.category_id === (b as any).category_id);
      return {
        booking: b as any,
        customer: byId.get((b as any).customer_id) ?? null,
        worker: byId.get((b as any).worker_id) ?? null,
        phone: (contact as any)?.[0]?.phone ?? null,
        workerMeta: wp as any,
        professionRank: idx >= 0 ? idx + 1 : null,
        professionVerified: idx >= 0 ? (list[idx] as any).verification_status === "approved" : false,
        workerStatus,
      };
    },
  });

  // Live updates: booking row + messages counter
  useEffect(() => {
    const ch = supabase
      .channel(`booking-detail:${bookingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        () => qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `booking_id=eq.${bookingId}` },
        () => qc.invalidateQueries({ queryKey: ["booking-messages-count", bookingId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [bookingId, qc]);

  if (isLoading) return <BookingSkeleton />;
  if (error) {
    const msg = (error as any)?.message ?? "";
    const denied = /permission|policy|denied/i.test(msg);
    return (
      <ErrorState
        title={denied ? "Access denied" : "Loading failed"}
        message={denied
          ? "You don't have permission to view this booking."
          : "We couldn't load this booking. Check your connection and try again."}
      />
    );
  }
  if (!data || !data.booking) {
    return <ErrorState title="Booking not found" message="This booking may have been deleted, or you don't have access to it." />;
  }

  const b = data.booking;
  const isCustomer = b.customer_id === user!.id;
  const isWorker = b.worker_id === user!.id;
  const isAdmin = role === "admin";
  const status: string = b.status;
  const ended = ENDED.includes(status);

  const canOnTheWay = isWorker && status === "accepted";
  const canArrived = isWorker && status === "on_the_way";
  const canStart = isWorker && status === "arrived";
  const canComplete = isWorker && ["in_progress", "worker_on_the_way", "work_started"].includes(status);
  const canChat = ["accepted","on_the_way","arrived","in_progress","awaiting_customer_confirmation","worker_marked_complete","worker_on_the_way","work_started","completed","disputed","closed","customer_confirmed_complete"].includes(status);
  const canDispute = isCustomer && ["awaiting_customer_confirmation","worker_marked_complete","in_progress","completed"].includes(status);

  const navAllowed = isWorker && ["accepted","on_the_way","arrived","in_progress","worker_on_the_way","work_started"].includes(status);
  const destination =
    b.latitude != null && b.longitude != null
      ? `${b.latitude},${b.longitude}`
      : [b.address, b.service_area].filter(Boolean).join(", ");
  const navUrl = navAllowed && destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`
    : null;

  const showAddress = isCustomer || isAdmin || ["accepted","on_the_way","arrived","in_progress","awaiting_customer_confirmation","worker_marked_complete","completed","disputed","closed"].includes(status);
  const photos: string[] = Array.isArray(b.photos) ? b.photos.filter((p: any) => typeof p === "string") : [];

  const call = async (rpc: string) => {
    setBusy(rpc);
    const { error } = await supabase.rpc(rpc as any, { _booking_id: b.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["worker-bookings"] });
  };

  const customerName = data.customer?.full_name ?? "Customer";
  const workerName = data.worker?.full_name ?? "Worker";
  const rankLabel = professionRankLabel(data.professionRank);

  const timeline = status === "disputed" || b.disputed_at
    ? [
        { label: "Booking created", at: b.created_at, actor: customerName, Icon: Calendar },
        { label: "Worker accepted", at: b.accepted_at, actor: workerName, Icon: CheckCircle2 },
        { label: "Work started", at: b.started_at, actor: workerName, Icon: PlayCircle },
        { label: "Dispute opened", at: b.disputed_at, actor: customerName, Icon: Gavel },
        { label: "Admin joined", at: b.admin_review_requested_at, actor: "Admin", Icon: Scale },
        { label: "Resolution", at: b.admin_resolved_at, actor: "Admin", Icon: ShieldCheck },
        { label: "Closed", at: status === "closed" ? b.updated_at : null, actor: "System", Icon: Flag },
      ]
    : [
        { label: "Booking created", at: b.created_at, actor: customerName, Icon: Calendar },
        { label: "Worker accepted", at: b.accepted_at, actor: workerName, Icon: CheckCircle2 },
        { label: "Worker on the way", at: b.on_the_way_at, actor: workerName, Icon: Truck },
        { label: "Worker arrived", at: b.arrived_at, actor: workerName, Icon: MapPin },
        { label: "Work started", at: b.started_at, actor: workerName, Icon: PlayCircle },
        { label: "Worker marked complete", at: b.worker_completed_at, actor: workerName, Icon: Flag },
        { label: "Customer confirmed", at: b.customer_confirmed_at, actor: customerName, Icon: UserCheck },
        { label: "Completed", at: status === "completed" || status === "closed" ? (b.payment_confirmed_at ?? b.customer_confirmed_at) : null, actor: "System", Icon: CheckCircle2 },
      ];

  const availabilityLabel =
    data.workerStatus === "busy" ? "Currently busy"
    : data.workerMeta?.is_available === false ? "Unavailable"
    : "Available";

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6 rounded-b-3xl">
        <div className="mx-auto max-w-2xl">
          <BackButton fallback={isWorker ? "/worker/jobs" : "/bookings"} className="text-primary-foreground/90 hover:text-primary-foreground" />
          <div className="mt-3">
            <span className="inline-block text-[10px] uppercase tracking-wide font-bold bg-white/20 px-2 py-0.5 rounded-full">{statusLabel(status)}</span>
            <h1 className="font-display text-xl sm:text-2xl font-bold mt-2">{b.categories?.name ?? "Booking"}</h1>
            <p className="text-sm opacity-80 mt-1">
              Booking #{String(b.id).slice(0, 8)}
              {rankLabel ? ` · ${rankLabel}` : ""}
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-5 -mt-3 space-y-3">
        {/* Parties */}
        <section className="rounded-2xl bg-card border border-border p-4 shadow-card grid gap-3 sm:grid-cols-2">
          <PartyCard
            label="Customer"
            name={customerName}
            avatar={data.customer?.avatar_url}
          />
          <PartyCard
            label="Worker"
            name={workerName}
            avatar={data.worker?.avatar_url}
            verified={data.workerMeta?.verification_status === "approved"}
            sub={
              <>
                {data.workerMeta?.rating ? `★ ${data.workerMeta.rating}` : "New pro"}
                {data.workerMeta?.reviews_count ? ` (${data.workerMeta.reviews_count})` : ""}
                {data.workerMeta?.jobs_completed != null ? ` · ${data.workerMeta.jobs_completed} jobs` : ""}
              </>
            }
          />
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1 border-t border-border">
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full mt-2 ${
              availabilityLabel === "Available" ? "bg-success/15 text-success" :
              availabilityLabel === "Currently busy" ? "bg-gold/20 text-gold-foreground" :
              "bg-muted text-muted-foreground"}`}>
              Worker: {availabilityLabel}
            </span>
            <span className="mt-2 text-[11px] font-bold px-2 py-1 rounded-full bg-primary-soft text-primary">
              {b.categories?.name ?? "Service"}{rankLabel ? ` · ${rankLabel}` : ""}
              {data.professionVerified ? " · verified" : ""}
            </span>
            {data.phone && (isCustomer || isWorker) && (
              <a href={`tel:${data.phone}`} className="mt-2 ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-xs font-semibold">
                <Phone className="size-3.5" /> Call
              </a>
            )}
          </div>
        </section>

        {/* Amounts */}
        <section className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-display font-bold text-sm mb-3 inline-flex items-center gap-1"><Wallet className="size-4"/> Amounts</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Amount label="Customer estimate" value={fmtGHS(b.estimated_amount ?? b.estimated_cost ?? b.budget)} />
            <Amount label="Worker final" value={fmtGHS(b.final_amount)} highlight />
            <Amount label="Customer paid" value={fmtGHS(b.amount_paid)} success />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Payment status: <span className="font-semibold">{statusLabel(b.payment_status ?? "unpaid")}</span></p>
        </section>

        {/* Estimate */}
        <EstimateSection
          bookingId={b.id}
          isWorker={isWorker}
          isCustomer={isCustomer}
          canSubmit={isWorker && ["accepted", "on_the_way", "arrived"].includes(status)}
          finalAmount={b.final_amount}
          varianceReason={b.final_amount_reason}
          varianceNote={b.final_amount_note}
        />



        {/* Job info */}
        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm">Job details</h3>
          <p className="text-sm whitespace-pre-wrap">{b.description}</p>
          <div className="grid gap-1 text-xs text-muted-foreground pt-1">
            {b.scheduled_at && (
              <>
                <p className="inline-flex items-center gap-1"><Calendar className="size-3"/>Date: {new Date(b.scheduled_at).toLocaleDateString()}</p>
                <p className="inline-flex items-center gap-1"><Clock className="size-3"/>Time: {new Date(b.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </>
            )}
            {b.service_area && <p className="inline-flex items-center gap-1"><MapPin className="size-3"/>{b.service_area}</p>}
            {b.address && showAddress && <p className="text-foreground/80">📍 {b.address}</p>}
            {b.completion_note && <p className="italic">Worker note: "{b.completion_note}"</p>}
          </div>
          {b.job_application_id && (
            <p className="text-[11px] text-muted-foreground pt-1 inline-flex items-center gap-1">
              <ShieldCheck className="size-3"/> Hired from job application
            </p>
          )}
        </section>

        {/* Map */}
        {(showAddress || b.service_area) && (
          <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
            <h3 className="font-display font-bold text-sm">Location</h3>
            <LocationMap area={b.service_area ?? b.address ?? "Accra"} height={180} />
          </section>
        )}

        {/* Photos / attachments */}
        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm inline-flex items-center gap-1"><ImageIcon className="size-4"/> Photos & attachments</h3>
          {photos.length === 0 ? (
            <p className="text-xs text-muted-foreground">No photos or attachments on this booking.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-border">
                  <img src={src} alt={`Booking attachment ${i + 1}`} className="size-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Status callouts */}
        {status === "declined" && (
          <section className="rounded-2xl bg-destructive/5 border border-destructive/20 p-3 text-sm">
            <p className="font-semibold text-destructive inline-flex items-center gap-1"><XCircle className="size-4"/> Declined</p>
            {b.decline_note && <p className="text-xs text-muted-foreground mt-1 italic">"{b.decline_note}"</p>}
          </section>
        )}
        {["awaiting_customer_confirmation","worker_marked_complete"].includes(status) && (
          <section className="rounded-2xl bg-gold/10 border border-gold/30 p-3 text-sm">
            <p className="font-semibold inline-flex items-center gap-1"><Clock className="size-4"/> Awaiting customer confirmation</p>
            {isCustomer
              ? <p className="text-xs mt-1 text-muted-foreground">Go to <Link to="/bookings" className="text-primary font-semibold">My bookings</Link> to confirm payment and leave a review.</p>
              : <p className="text-xs mt-1 text-muted-foreground">You marked this completed. The customer will confirm and rate.</p>}
          </section>
        )}
        {(status === "completed" || status === "closed") && (
          <section className="rounded-2xl bg-success/10 border border-success/30 p-3 text-sm">
            <p className="font-semibold text-success inline-flex items-center gap-1"><CheckCircle2 className="size-4"/> Completed</p>
          </section>
        )}

        {/* Dispute status */}
        {(status === "disputed" || b.disputed_at) && (
          <section className="rounded-2xl bg-destructive/5 border border-destructive/20 p-4 text-sm space-y-2">
            <p className="font-semibold text-destructive inline-flex items-center gap-1"><AlertTriangle className="size-4"/> Dispute</p>
            {b.dispute_details && <p className="text-xs italic">"{b.dispute_details}"</p>}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {disputeStage(b).map((s) => (
                <span key={s.key} className="text-[11px] font-bold px-2 py-1 rounded-full bg-destructive/10 text-destructive">{s.label}</span>
              ))}
            </div>
            {b.admin_resolution_note && (
              <p className="text-xs text-muted-foreground">Admin resolution: {b.admin_resolution_note}</p>
            )}
          </section>
        )}

        {/* Timeline */}
        <section className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-display font-bold text-sm mb-3">Timeline</h3>
          <ol className="relative space-y-3">
            {timeline.map((step, i) => {
              const done = !!step.at;
              const Icon = step.Icon;
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className={`size-7 shrink-0 grid place-items-center rounded-full ${done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${done ? "" : "text-muted-foreground"}`}>{step.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {step.actor}
                      {done ? ` · ${new Date(step.at!).toLocaleString()}` : " · pending"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <WorkProgressPanel booking={b} userId={user!.id} isWorker={isWorker} />

        <ReturnJobPanel
          bookingId={b.id}
          userId={user!.id}
          isWorker={isWorker}
          isCustomer={isCustomer}
          bookingStatus={status}
        />



        {/* Support */}
        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm inline-flex items-center gap-1"><LifeBuoy className="size-4"/> Need help?</h3>
          <div className="flex flex-wrap gap-2">
            <Link to="/support" className="px-3 py-2 rounded-xl bg-muted text-sm font-semibold">Contact support</Link>
            {canDispute && (
              <button onClick={() => setShowDispute(true)} className="px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold inline-flex items-center gap-1">
                <Gavel className="size-4"/> Open dispute
              </button>
            )}
            {isWorker && status === "disputed" && (
              <button disabled={busy !== null} onClick={() => call("worker_request_admin_review")} className="px-3 py-2 rounded-xl bg-muted text-sm font-semibold disabled:opacity-50">
                Request admin review
              </button>
            )}
            <a href="tel:191" className="px-3 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold inline-flex items-center gap-1">
              <Phone className="size-4"/> Emergency contact
            </a>
          </div>
        </section>

        {/* Action bar */}
        <section className="flex flex-wrap gap-2 pt-1">
          {navUrl && (
            <a href={navUrl} target="_blank" rel="noopener noreferrer"
              className="px-3 py-2.5 rounded-xl bg-muted text-sm font-semibold inline-flex items-center gap-1">
              <Navigation className="size-4"/> Navigate
            </a>
          )}
          {canChat && (
            <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
              <MessageCircle className="size-4"/> {ended ? "View chat" : "Open chat"}
            </Link>
          )}
          {canOnTheWay && (
            <button disabled={busy !== null} onClick={() => call("worker_mark_on_the_way")} className="px-3 py-2.5 rounded-xl bg-gold text-gold-foreground text-sm font-semibold disabled:opacity-50">
              I'm on the way
            </button>
          )}
          {canArrived && (
            <button disabled={busy !== null} onClick={() => call("worker_mark_arrived")} className="px-3 py-2.5 rounded-xl bg-gold text-gold-foreground text-sm font-semibold disabled:opacity-50">
              I've Arrived
            </button>
          )}
          {canStart && (
            <button disabled={busy !== null} onClick={() => call("worker_start_booking")} className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              Start Job
            </button>
          )}
          {canComplete && (
            <button onClick={() => setShowComplete(true)} className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
              Complete job <ArrowRight className="size-3.5"/>
            </button>
          )}
          {isCustomer && ["awaiting_customer_confirmation","worker_marked_complete"].includes(status) && (
            <Link to="/bookings" className="px-3 py-2.5 rounded-xl bg-success text-success-foreground text-sm font-semibold">
              Confirm & Review
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin/bookings" className="px-3 py-2.5 rounded-xl bg-muted text-sm font-semibold">Admin bookings</Link>
          )}
        </section>
      </main>

      {showComplete && (
        <CompleteJobModal
          bookingId={b.id}
          onClose={() => setShowComplete(false)}
          onDone={() => {
            setShowComplete(false);
            qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
            qc.invalidateQueries({ queryKey: ["worker-jobs"] });
          }}
        />
      )}

      {showDispute && (
        <DisputeModal
          bookingId={b.id}
          onClose={() => setShowDispute(false)}
          onDone={() => {
            setShowDispute(false);
            qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
          }}
        />
      )}
    </div>
  );
}

function Amount({ label, value, highlight, success }: { label: string; value: string; highlight?: boolean; success?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/60 px-2 py-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{label}</p>
      <p className={`text-sm font-bold mt-1 ${highlight ? "text-primary" : success ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}

function PartyCard({ label, name, avatar, verified, sub }: {
  label: string; name: string; avatar?: string | null; verified?: boolean; sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-12 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold">
        {avatar ? <img src={avatar} className="size-full object-cover" alt="" /> : (name?.[0]?.toUpperCase() ?? <User className="size-5"/>)}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{label}</p>
        <div className="flex items-center gap-1">
          <p className="font-semibold truncate">{name}</p>
          {verified && <BadgeCheck className="size-4 text-primary" />}
        </div>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

function DisputeModal({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(DISPUTE_REASONS[0].code);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("customer_dispute_booking", {
      _booking_id: bookingId, _reason_code: reason, _details: details.trim() || null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dispute submitted. Our team will review it.");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-bold">Open a dispute</h3>
        <div className="space-y-1.5">
          {DISPUTE_REASONS.map((r) => (
            <label key={r.code} className="flex items-center gap-2 text-sm">
              <input type="radio" name="dispute" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} className="accent-primary"/>
              {r.label}
            </label>
          ))}
        </div>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3}
          placeholder="Tell us what happened…"
          className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-muted text-sm font-semibold">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? "Submitting…" : "Submit dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}
