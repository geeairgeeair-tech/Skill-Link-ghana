import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcceptedEstimates } from "@/lib/accepted-estimates";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_COLUMNS } from "@/lib/booking-columns";
import { bookingTimingLines } from "@/lib/job-timing";
import { AppShell } from "@/components/app-shell";
import { ConfirmCompletionModal } from "@/components/confirm-completion-modal";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, Star, MessageCircle, ClipboardList, XCircle, CheckCircle2, AlertTriangle } from "lucide-react";

const DECLINE_LABELS: Record<string, string> = {
  schedule_conflict: "Schedule conflict",
  too_far: "Too far from service area",
  budget_low: "Budget is too low",
  no_equipment: "Missing required equipment",
  unavailable: "Currently unavailable",
  unclear_details: "Job details are unclear",
  safety_concern: "Safety concern",
  wrong_category: "Wrong category or service",
  other: "Other",
};

const DISPUTE_REASONS = [
  { code: "not_completed", label: "Work not completed" },
  { code: "quality", label: "Work quality problem" },
  { code: "amount", label: "Amount disagreement" },
  { code: "no_show", label: "Worker did not attend" },
  { code: "damage", label: "Damage or safety concern" },
  { code: "other", label: "Other" },
];

export const Route = createFileRoute("/_authenticated/bookings/")({
  component: BookingsPage,
});

const TABS = [
  { key: "recent", label: "Recent" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type TabKey = typeof TABS[number]["key"];

const fmtGHS = (n: number | null | undefined) =>
  n == null ? "—" : `GH₵${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ACTIVE_STATUSES = ["pending","accepted","in_progress","on_the_way","arrived","worker_on_the_way","work_started","awaiting_customer_confirmation","worker_marked_complete","disputed"];
function matchesTab(status: string, tab: TabKey) {
  if (tab === "recent") return true;
  if (tab === "active") return ACTIVE_STATUSES.includes(status);
  if (tab === "completed") return status === "completed" || status === "closed" || status === "customer_confirmed_complete";
  if (tab === "cancelled") return status === "cancelled" || status === "declined";
  return false;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  accepted: "bg-primary-soft text-primary",
  in_progress: "bg-primary-soft text-primary",
  awaiting_customer_confirmation: "bg-gold/20 text-gold-foreground",
  completed: "bg-success/20 text-success-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  declined: "bg-destructive/15 text-destructive",
  disputed: "bg-destructive/15 text-destructive",
};

function BookingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("recent");
  const [confirmFor, setConfirmFor] = useState<any | null>(null);
  const [disputeFor, setDisputeFor] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev: any) => prev,
    queryFn: async () => {

      const { data: rows, error } = await (supabase.from("bookings") as any)
        .select(`${BOOKING_COLUMNS}, categories(name), reviews(id, rating, comment)`)
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.worker_id).filter(Boolean)));
      let profMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids as string[]);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      }
      return (rows ?? []).map((r: any) => ({ ...r, profiles: profMap[r.worker_id] ?? null }));
    },
  });

  const { data: acceptedEstimates } = useAcceptedEstimates((data ?? []).map((b: any) => b.id));

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = (data ?? []).filter((b: any) => matchesTab(b.status, t.key)).length;
    return acc;
  }, {} as Record<TabKey, number>);

  const visible = (data ?? []).filter((b: any) => matchesTab(b.status, tab));

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3 mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold">My bookings</h1>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5">
            <Calendar className="size-3.5"/> Bookings
          </div>
          <Link to="/jobs/mine" className="h-10 rounded-xl border border-border bg-card text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-muted">
            <ClipboardList className="size-3.5"/> My Job Posts
          </Link>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 snap-x scrollbar-none">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 snap-start px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${tab === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              {t.label} <span className="opacity-70">({counts[t.key]})</span>
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 space-y-3 mt-3 pb-32">
        {isLoading && !data ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)
        ) : visible.length === 0 ? (

          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Calendar className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No {TABS.find(t=>t.key===tab)?.label.toLowerCase()} bookings.</p>
            <Link to="/workers" className="mt-3 inline-block text-primary font-semibold text-sm">Find a pro →</Link>
          </div>
        ) : visible.map((b: any) => {
          const hasReview = (b.reviews ?? []).length > 0;
          const awaiting = b.status === "awaiting_customer_confirmation" || b.status === "worker_marked_complete";
          return (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-9 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-xs">
                    {b.profiles?.avatar_url ? <img src={b.profiles.avatar_url} alt="" className="size-full object-cover"/> : (b.profiles?.full_name?.[0]?.toUpperCase() ?? "?")}
                  </div>
                  <p className="font-semibold truncate">{b.profiles?.full_name ?? "Worker"}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] ?? "bg-muted"}`}>
                  {b.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{b.categories?.name}</p>
              <p className="text-sm mt-2 line-clamp-2">{b.description}</p>
              {bookingTimingLines(b as any).length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">{bookingTimingLines(b as any).join(" · ")}</p>
              )}
              {(b.budget ?? b.estimated_cost) != null && <p className="text-sm font-semibold text-primary mt-1">Customer Budget: {fmtGHS(b.budget ?? b.estimated_cost)}</p>}
              {acceptedEstimates?.[b.id] != null && <p className="text-sm text-muted-foreground mt-1">Accepted Estimate: {fmtGHS(acceptedEstimates[b.id])}</p>}

              {b.final_amount != null && <p className="text-sm font-semibold text-primary mt-1">Final: {fmtGHS(b.final_amount)}</p>}
              {b.amount_paid != null && <p className="text-sm text-success mt-1 inline-flex items-center gap-1"><CheckCircle2 className="size-3.5"/>Paid: {fmtGHS(b.amount_paid)}</p>}

              {b.status === "declined" && (
                <div className="mt-3 rounded-xl bg-destructive/5 border border-destructive/20 p-3 text-sm">
                  <p className="font-semibold text-destructive inline-flex items-center gap-1"><XCircle className="size-4"/> This professional declined the booking.</p>
                  {b.decline_reason && <p className="text-xs mt-1"><span className="font-semibold">Reason:</span> {DECLINE_LABELS[b.decline_reason] ?? b.decline_reason}</p>}
                  {b.decline_note && <p className="text-xs text-muted-foreground mt-1 italic">"{b.decline_note}"</p>}
                </div>
              )}

              {awaiting && (
                <div className="mt-3 rounded-xl bg-gold/10 border border-gold/30 p-3 text-sm">
                  <p className="font-semibold inline-flex items-center gap-1"><AlertTriangle className="size-4"/> Please confirm this job</p>
                  <p className="text-xs mt-1 text-muted-foreground">Your pro reported a final amount of {fmtGHS(b.final_amount)}. Confirm payment and leave a rating.</p>
                  {b.completion_note && <p className="text-xs mt-1 italic">"{b.completion_note}"</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => setConfirmFor(b)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-success text-success-foreground">
                      Confirm & Review
                    </button>
                    <button onClick={() => setDisputeFor(b)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive/15 text-destructive">
                      Report a Problem
                    </button>
                  </div>
                </div>
              )}

              {b.status === "disputed" && (
                <div className="mt-3 rounded-xl bg-destructive/5 border border-destructive/20 p-3 text-sm">
                  <p className="font-semibold text-destructive">Dispute opened — an admin will review.</p>
                  {b.dispute_details && <p className="text-xs mt-1 italic">"{b.dispute_details}"</p>}
                </div>
              )}

              <BookingTimeline b={b} />

              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                  Open Booking →
                </Link>
                <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">
                  <MessageCircle className="size-3" /> Chat
                </Link>
                {hasReview && (
                  <span className="inline-flex items-center gap-1 text-xs text-success font-semibold">
                    <Star className="size-3 fill-current" /> Reviewed · {b.reviews[0].rating}/5
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {confirmFor && (
        <ConfirmCompletionModal booking={confirmFor} onClose={() => setConfirmFor(null)}
          onDone={() => { setConfirmFor(null); qc.invalidateQueries({ queryKey: ["my-bookings"] }); }} />
      )}
      {disputeFor && (
        <DisputeModal booking={disputeFor} onClose={() => setDisputeFor(null)}
          onDone={() => { setDisputeFor(null); qc.invalidateQueries({ queryKey: ["my-bookings"] }); }} />
      )}
    </AppShell>
  );
}


function DisputeModal({ booking, onClose, onDone }: { booking: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (details.trim().length < 10) return toast.error("Please describe the issue (min 10 chars)");
    setSaving(true);
    const { error } = await supabase.rpc("customer_dispute_booking", {
      _booking_id: booking.id, _reason_code: reason, _details: details.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dispute submitted — an admin will review it.");
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4">
      <div className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display font-bold text-lg">Report a problem</h3>
        <div className="mt-4 space-y-2">
          {DISPUTE_REASONS.map(r => (
            <label key={r.code} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${reason === r.code ? "border-primary bg-primary-soft/40" : "border-border"}`}>
              <input type="radio" name="dispute" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} className="accent-primary"/>
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
        <textarea value={details} onChange={e => setDetails(e.target.value)}
          placeholder="Describe what happened (required)…"
          className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[100px]"/>
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !reason} className="px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground disabled:opacity-60">
            {saving ? "Submitting…" : "Submit dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingTimeline({ b }: { b: any }) {
  const steps: { key: string; label: string; at: string | null }[] = [
    { key: "requested", label: "Requested", at: b.created_at },
    { key: "accepted", label: "Accepted", at: b.accepted_at },
    { key: "on_the_way", label: "On the way", at: b.on_the_way_at },
    { key: "arrived", label: "Arrived", at: b.arrived_at },
    { key: "started", label: "Started", at: b.started_at },
    { key: "completed", label: "Completed", at: b.customer_confirmed_at ?? b.worker_completed_at },
  ];
  const done = steps.filter((s) => s.at);
  if (done.length < 2) return null;
  return (
    <div className="mt-3 rounded-xl bg-muted/40 border border-border p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Timeline</p>
      <ol className="space-y-1">
        {done.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[11px]">
            <span className="size-1.5 rounded-full bg-success shrink-0" />
            <span className="font-semibold text-foreground">{s.label}</span>
            <span className="text-muted-foreground ml-auto">{new Date(s.at!).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
