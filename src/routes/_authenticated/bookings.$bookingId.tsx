import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  MapPin, Calendar, Wallet, MessageCircle, User, BadgeCheck, Phone,
  CheckCircle2, XCircle, AlertTriangle, Clock, ArrowRight, ShieldCheck,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
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

function BookingDetail() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-detail", bookingId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: b, error } = await supabase
        .from("bookings")
        .select("*, categories(name)")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      if (!b) return null;
      const partnerId = b.customer_id === user!.id ? b.worker_id : b.customer_id;
      const [{ data: partner }, { data: contact }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").eq("id", partnerId).maybeSingle(),
        supabase.rpc("get_profile_contact", { _id: partnerId }),
      ]);
      let workerMeta: any = null;
      if (b.customer_id === user!.id) {
        const { data: wp } = await supabase
          .from("worker_profiles")
          .select("rating, reviews_count, jobs_completed, verification_status, categories(name)")
          .eq("user_id", b.worker_id).maybeSingle();
        workerMeta = wp;
      }
      return { booking: b as any, partner: partner as any, phone: (contact as any)?.[0]?.phone ?? null, workerMeta };
    },
  });

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading booking…</div>;
  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-destructive font-semibold">Couldn't load booking.</p>
        <Link to="/bookings" className="text-primary font-semibold">Back to bookings</Link>
      </div>
    );
  }
  if (!data || !data.booking) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="font-semibold">Booking not available</p>
        <p className="text-sm text-muted-foreground">This booking may have been removed or you don't have access.</p>
        <Link to="/bookings" className="inline-block text-primary font-semibold">Back to bookings</Link>
      </div>
    );
  }

  const b = data.booking;
  const partner = data.partner;
  const isCustomer = b.customer_id === user!.id;
  const isWorker = b.worker_id === user!.id;
  const status: string = b.status;

  const canOnTheWay = isWorker && status === "accepted";
  const canArrived = isWorker && status === "on_the_way";
  const canStart = isWorker && status === "arrived";
  const canComplete = isWorker && ["in_progress", "worker_on_the_way", "work_started"].includes(status);
  const canChat = ["accepted","on_the_way","arrived","in_progress","awaiting_customer_confirmation","worker_marked_complete","worker_on_the_way","work_started","completed","disputed"].includes(status);

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

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6 rounded-b-3xl">
        <BackButton fallback={isWorker ? "/worker/jobs" : "/bookings"} className="text-primary-foreground/90 hover:text-primary-foreground" />
        <div className="mt-3">
          <span className="inline-block text-[10px] uppercase tracking-wide font-bold bg-white/20 px-2 py-0.5 rounded-full">{statusLabel(status)}</span>
          <h1 className="font-display text-xl font-bold mt-2">{b.categories?.name ?? "Booking"}</h1>
          <p className="text-sm opacity-80 mt-1">Booking #{String(b.id).slice(0, 8)}</p>
        </div>
      </div>

      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        {/* Partner card */}
        <section className="rounded-2xl bg-card border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="size-14 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold">
              {partner?.avatar_url ? <img src={partner.avatar_url} className="size-full object-cover" alt="" /> : (partner?.full_name?.[0]?.toUpperCase() ?? <User className="size-5"/>)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 flex-wrap">
                <p className="font-semibold truncate">{partner?.full_name ?? (isCustomer ? "Worker" : "Customer")}</p>
                {data.workerMeta?.verification_status === "approved" && (
                  <BadgeCheck className="size-4 text-primary fill-primary-soft" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{isCustomer ? "Your professional" : "Customer"}</p>
              {data.workerMeta && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {data.workerMeta.rating ? `★ ${data.workerMeta.rating}` : "New pro"}
                  {data.workerMeta.reviews_count ? ` (${data.workerMeta.reviews_count})` : ""}
                  {data.workerMeta.jobs_completed != null ? ` · ${data.workerMeta.jobs_completed} jobs` : ""}
                </p>
              )}
            </div>
            {data.phone && (
              <a href={`tel:${data.phone}`} className="size-10 rounded-full bg-muted grid place-items-center" aria-label="Call">
                <Phone className="size-4" />
              </a>
            )}
          </div>
        </section>

        {/* Job info */}
        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold text-sm">Job details</h3>
          <p className="text-sm whitespace-pre-wrap">{b.description}</p>
          <div className="grid gap-1 text-xs text-muted-foreground pt-1">
            {b.scheduled_at && <p className="inline-flex items-center gap-1"><Calendar className="size-3"/>{new Date(b.scheduled_at).toLocaleString()}</p>}
            {b.service_area && <p className="inline-flex items-center gap-1"><MapPin className="size-3"/>{b.service_area}</p>}
            {b.address && (isCustomer || ["accepted","on_the_way","arrived","in_progress","awaiting_customer_confirmation","worker_marked_complete","completed","disputed"].includes(status)) && (
              <p className="text-foreground/80">📍 {b.address}</p>
            )}
            {(b.estimated_amount ?? b.estimated_cost ?? b.budget) != null && (
              <p className="inline-flex items-center gap-1"><Wallet className="size-3"/>Estimate {fmtGHS(b.estimated_amount ?? b.estimated_cost ?? b.budget)}</p>
            )}
            {b.final_amount != null && (
              <p className="inline-flex items-center gap-1 font-semibold text-primary"><Wallet className="size-3"/>Final {fmtGHS(b.final_amount)}</p>
            )}
            {b.amount_paid != null && (
              <p className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3"/>Paid {fmtGHS(b.amount_paid)}</p>
            )}
          </div>
          {b.job_application_id && (
            <p className="text-[11px] text-muted-foreground pt-1 inline-flex items-center gap-1">
              <ShieldCheck className="size-3"/> Hired from job application
            </p>
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
        {status === "completed" && (
          <section className="rounded-2xl bg-success/10 border border-success/30 p-3 text-sm">
            <p className="font-semibold text-success inline-flex items-center gap-1"><CheckCircle2 className="size-4"/> Completed</p>
          </section>
        )}
        {status === "disputed" && (
          <section className="rounded-2xl bg-destructive/5 border border-destructive/20 p-3 text-sm">
            <p className="font-semibold text-destructive inline-flex items-center gap-1"><AlertTriangle className="size-4"/> Under admin review</p>
            {b.dispute_details && <p className="text-xs mt-1 italic">"{b.dispute_details}"</p>}
          </section>
        )}

        {/* Timeline */}
        <section className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-display font-bold text-sm mb-2">Timeline</h3>
          <ol className="space-y-1.5 text-xs">
            {[
              { label: "Requested", at: b.created_at },
              { label: "Accepted", at: b.accepted_at },
              { label: "On the way", at: b.on_the_way_at },
              { label: "Arrived", at: b.arrived_at },
              { label: "Started", at: b.started_at },
              { label: "Worker marked complete", at: b.worker_completed_at },
              { label: "Customer confirmed", at: b.customer_confirmed_at },
            ].filter(s => s.at).map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-success shrink-0" />
                <span className="font-semibold">{s.label}</span>
                <span className="text-muted-foreground ml-auto">{new Date(s.at!).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Action bar */}
        <section className="flex flex-wrap gap-2 pt-1">
          {canChat && (
            <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
              <MessageCircle className="size-4"/> Open chat
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
            <button onClick={() => navigate({ to: "/worker/jobs" })} className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
              Mark completed <ArrowRight className="size-3.5"/>
            </button>
          )}
          {isCustomer && ["awaiting_customer_confirmation","worker_marked_complete"].includes(status) && (
            <Link to="/bookings" className="px-3 py-2.5 rounded-xl bg-success text-success-foreground text-sm font-semibold">
              Confirm & Review
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}
