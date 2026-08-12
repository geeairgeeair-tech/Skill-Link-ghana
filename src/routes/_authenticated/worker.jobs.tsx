import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_COLUMNS } from "@/lib/booking-columns";
import { uniqueChannel } from "@/lib/realtime";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { CompleteJobModal } from "@/components/complete-job-modal";
import { MessageCircle, MapPin, Calendar, Wallet, AlertTriangle, XCircle, CheckCircle2, Clock, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/jobs")({
  component: JobsPage,
});

const TABS = [
  { key: "pending", label: "New Requests" },
  { key: "recent", label: "Recent" },
  { key: "active", label: "Active Jobs" },
  { key: "completed", label: "Completed Work" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type TabKey = typeof TABS[number]["key"];

const DECLINE_REASONS = [
  { code: "schedule_conflict", label: "Schedule conflict" },
  { code: "too_far", label: "Too far from my service area" },
  { code: "budget_low", label: "Budget is too low" },
  { code: "no_equipment", label: "I don't have the required equipment" },
  { code: "unavailable", label: "I'm currently unavailable" },
  { code: "unclear_details", label: "Job details are unclear" },
  { code: "safety_concern", label: "Safety concern" },
  { code: "wrong_category", label: "Wrong category or service" },
  { code: "other", label: "Other" },
];

const fmtGHS = (n: number | null | undefined) =>
  n == null ? "—" : `GH₵${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ACTIVE_STATUSES = ["pending","accepted","in_progress","on_the_way","arrived","worker_on_the_way","work_started","awaiting_customer_confirmation","worker_marked_complete","disputed"];
function matchesTab(status: string, tab: TabKey) {
  if (tab === "pending") return status === "pending";
  if (tab === "recent") return true;
  if (tab === "active") return ACTIVE_STATUSES.includes(status);
  if (tab === "completed") return status === "completed" || status === "closed" || status === "customer_confirmed_complete";
  if (tab === "cancelled") return status === "cancelled" || status === "declined";
  return false;
}

function statusLabel(s: string): string {
  switch (s) {
    case "pending": return "Awaiting your response";
    case "accepted": return "Accepted";
    case "on_the_way": return "On the way";
    case "arrived": return "Arrived on site";
    case "in_progress": return "In progress";
    case "awaiting_customer_confirmation": return "Awaiting customer";
    case "completed": return "Completed";
    case "declined": return "Declined";
    case "cancelled": return "Cancelled";
    case "expired": return "Expired";
    case "disputed": return "Disputed";
    default: return s.replace(/_/g, " ");
  }
}

function JobsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("pending");
  const [tabTouched, setTabTouched] = useState(false);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [completeFor, setCompleteFor] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["worker-jobs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error: qErr } = await (supabase.from("bookings") as any)
        .select(`${BOOKING_COLUMNS}, categories(name)`)
        .eq("worker_id", user!.id)
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean)));
      let profMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids as string[]);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      }
      return (rows ?? []).map((r: any) => ({ ...r, profiles: profMap[r.customer_id] ?? null }));
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = uniqueChannel(`worker-jobs:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["worker-jobs", user.id] });
          qc.invalidateQueries({ queryKey: ["worker-pending-count"] });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { pending: 0, recent: 0, active: 0, completed: 0, cancelled: 0 };
    (data ?? []).forEach((b: any) => { TABS.forEach(t => { if (matchesTab(b.status, t.key)) c[t.key]++; }); });
    return c;
  }, [data]);

  // Pending requests come first; fall back to Recent when nothing is pending.
  useEffect(() => {
    if (!tabTouched && data && counts.pending === 0 && tab === "pending") setTab("recent");
  }, [data, counts.pending, tab, tabTouched]);

  const visible = (data ?? []).filter((b: any) => matchesTab(b.status, tab));

  const acceptBooking = async (id: string) => {
    const { error: uErr } = await supabase.rpc("worker_accept_booking", { _booking_id: id });
    if (uErr) return toast.error(uErr.message);
    toast.success("Accepted");
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
    qc.invalidateQueries({ queryKey: ["worker-pending-count"] });
  };

  const markOnTheWay = async (id: string) => {
    const { error: rErr } = await supabase.rpc("worker_mark_on_the_way", { _booking_id: id });
    if (rErr) return toast.error(rErr.message);
    toast.success("Customer notified — you're on the way");
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
  };

  const markArrived = async (id: string) => {
    const { error: rErr } = await supabase.rpc("worker_mark_arrived", { _booking_id: id });
    if (rErr) return toast.error(rErr.message);
    toast.success("Customer notified — you've arrived");
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
  };

  const startJob = async (id: string) => {
    const { error: rErr } = await supabase.rpc("worker_start_booking", { _booking_id: id });
    if (rErr) return toast.error(rErr.message);
    toast.success("Job started successfully");
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
  };

  const requestReview = async (id: string) => {
    const { error: rErr } = await supabase.rpc("worker_request_admin_review", { _booking_id: id });
    if (rErr) return toast.error(rErr.message);
    toast.success("Admin review requested");
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
  };

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3 mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold">Bookings / Work</h1>
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
            <button key={t.key} onClick={() => { setTabTouched(true); setTab(t.key); }}
              className={`shrink-0 snap-start px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${tab === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              {t.label} <span className="opacity-70">({counts[t.key]})</span>
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 space-y-3 pb-32">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-12">Loading jobs…</p>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold text-destructive">Couldn't load jobs.</p>
            <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">Retry</button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No {TABS.find(t=>t.key===tab)?.label.toLowerCase()} jobs.</p>
        ) : visible.map((b: any) => {
          const declined = b.status === "declined" || b.status === "cancelled";
          const awaiting = b.status === "awaiting_customer_confirmation" || b.status === "worker_marked_complete";
          const inProg = ["in_progress","worker_on_the_way","work_started"].includes(b.status);
          const declineLabel = DECLINE_REASONS.find(r => r.code === b.decline_reason)?.label;
          const customerName = b.profiles?.full_name?.trim() || "Skill Link Customer";
          const initial = (b.profiles?.full_name?.trim()?.[0] ?? "?").toUpperCase();
          const canRequestReview = awaiting && b.worker_completed_at &&
            (Date.now() - new Date(b.worker_completed_at).getTime()) > 72 * 3600 * 1000 &&
            !b.admin_review_requested_at;

          return (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="size-11 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-sm">
                  {b.profiles?.avatar_url
                    ? <img src={b.profiles.avatar_url} alt="" className="size-full object-cover"/>
                    : initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{customerName}</p>
                      <p className="text-xs text-muted-foreground">Profession: {b.categories?.name ?? "Service"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${
                        declined ? "bg-destructive/15 text-destructive"
                        : b.status === "pending" ? "bg-warning/20 text-warning-foreground"
                        : b.status === "completed" || b.status === "closed" ? "bg-success/15 text-success"
                        : b.status === "disputed" ? "bg-destructive/15 text-destructive"
                        : awaiting ? "bg-gold/20 text-gold-foreground"
                        : "bg-primary-soft text-primary"
                      }`}>{statusLabel(b.status)}</span>
                      {b.urgency && b.urgency !== "normal" && !declined && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-warning-foreground bg-warning/20 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="size-3"/>{b.urgency}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm mt-2">{b.description}</p>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                {b.scheduled_at && <p className="inline-flex items-center gap-1"><Calendar className="size-3"/>{new Date(b.scheduled_at).toLocaleString()}</p>}
                {b.service_area && <p className="inline-flex items-center gap-1"><MapPin className="size-3"/>{b.service_area}</p>}
                {(b.budget ?? b.estimated_cost) != null && <p className="inline-flex items-center gap-1 font-semibold text-primary"><Wallet className="size-3"/>Customer Budget: {fmtGHS(b.budget ?? b.estimated_cost)}</p>}
                {(b.estimated_amount ?? b.budget) != null && <p className="inline-flex items-center gap-1"><Wallet className="size-3"/>Estimate {fmtGHS(b.estimated_amount ?? b.budget)}</p>}

                {b.final_amount != null && <p className="inline-flex items-center gap-1"><Wallet className="size-3"/>You reported {fmtGHS(b.final_amount)}</p>}
                {b.amount_paid != null && <p className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3"/>Paid {fmtGHS(b.amount_paid)}</p>}
                {b.status !== "pending" && !declined && b.address && <p className="text-foreground/80">📍 {b.address}</p>}
              </div>

              {declined && declineLabel && (
                <div className="mt-3 rounded-xl bg-destructive/5 border border-destructive/20 p-2.5 text-xs">
                  <p className="inline-flex items-center gap-1 font-semibold text-destructive"><XCircle className="size-3.5"/> Reason: {declineLabel}</p>
                  {b.decline_note && <p className="text-muted-foreground mt-1">"{b.decline_note}"</p>}
                </div>
              )}

              {awaiting && (
                <div className="mt-3 rounded-xl bg-gold/10 border border-gold/30 p-2.5 text-xs">
                  <p className="inline-flex items-center gap-1 font-semibold"><Clock className="size-3.5"/> Awaiting customer confirmation</p>
                  <p className="text-muted-foreground mt-1">You marked this completed. The customer will confirm payment and leave a review.</p>
                  {canRequestReview && (
                    <button onClick={() => requestReview(b.id)} className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-warning/30 text-warning-foreground">
                      Request admin review (72h+)
                    </button>
                  )}
                  {b.admin_review_requested_at && <p className="text-warning-foreground mt-1">Admin review requested</p>}
                </div>
              )}

              {b.status === "disputed" && (
                <div className="mt-3 rounded-xl bg-destructive/5 border border-destructive/20 p-2.5 text-xs">
                  <p className="font-semibold text-destructive">Customer opened a dispute — awaiting admin resolution.</p>
                  {b.dispute_details && <p className="text-muted-foreground mt-1 italic">"{b.dispute_details}"</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {b.status === "pending" && <>
                  <button type="button" onClick={() => acceptBooking(b.id)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-success text-success-foreground">Accept</button>
                  <button type="button" onClick={() => setDeclineFor(b.id)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-destructive text-destructive-foreground">Decline</button>
                </>}
                {b.status === "accepted" && (
                  <button type="button" onClick={() => markOnTheWay(b.id)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-gold text-gold-foreground">I'm on the way</button>
                )}
                {b.status === "on_the_way" && (
                  <button type="button" onClick={() => markArrived(b.id)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-gold text-gold-foreground">I've Arrived</button>
                )}
                {b.status === "arrived" && (
                  <button type="button" onClick={() => startJob(b.id)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">Start Job</button>
                )}
                {inProg && (
                  <button type="button" onClick={() => setCompleteFor(b)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">Mark Job Completed</button>
                )}
                {["accepted","on_the_way","arrived","in_progress","awaiting_customer_confirmation","worker_marked_complete","worker_on_the_way","work_started"].includes(b.status) && (
                  <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="px-3 py-2 rounded-lg text-xs font-semibold bg-muted inline-flex items-center gap-1">
                    <MessageCircle className="size-3.5"/> Chat
                  </Link>
                )}
                <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="px-3 py-2 rounded-lg text-xs font-semibold bg-primary/10 text-primary ml-auto">
                  View details →
                </Link>
              </div>

            </div>
          );
        })}
      </main>

      {declineFor && (
        <DeclineModal bookingId={declineFor} onClose={() => setDeclineFor(null)}
          onDone={() => { setDeclineFor(null); qc.invalidateQueries({ queryKey: ["worker-jobs"] }); qc.invalidateQueries({ queryKey: ["worker-pending-count"] }); }} />
      )}
      {completeFor && (
        <CompleteJobModal bookingId={completeFor.id} onClose={() => setCompleteFor(null)}
          onDone={() => { setCompleteFor(null); qc.invalidateQueries({ queryKey: ["worker-jobs"] }); }} />
      )}
    </AppShell>
  );
}

function DeclineModal({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (reason === "other" && !note.trim()) return toast.error("Please explain your reason");
    setSaving(true);
    const { error } = await supabase.rpc("worker_decline_booking", {
      _booking_id: bookingId, _reason_code: reason, _reason_note: note.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Booking declined");
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4">
      <div className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display font-bold text-lg">Decline this booking</h3>
        <p className="text-xs text-muted-foreground mt-1">Choose a reason. The customer will see this.</p>
        <div className="mt-4 space-y-2">
          {DECLINE_REASONS.map(r => (
            <label key={r.code} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${reason === r.code ? "border-primary bg-primary-soft/40" : "border-border"}`}>
              <input type="radio" name="reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} className="accent-primary"/>
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder={reason === "other" ? "Please explain (required)…" : "Add a note (optional)…"}
          className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[70px]"/>
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !reason} className="px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground disabled:opacity-60">
            {saving ? "Declining…" : "Confirm decline"}
          </button>
        </div>
      </div>
    </div>
  );
}

