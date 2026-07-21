import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
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

export const Route = createFileRoute("/_authenticated/bookings")({
  component: BookingsPage,
});

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "awaiting", label: "Awaiting Confirmation" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
  { key: "disputed", label: "Disputed" },
] as const;
type TabKey = typeof TABS[number]["key"];

const fmtGHS = (n: number | null | undefined) =>
  n == null ? "—" : `GH₵${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function matchesTab(status: string, tab: TabKey) {
  if (tab === "active") return ["accepted","in_progress","on_the_way","arrived","worker_on_the_way","work_started"].includes(status);
  if (tab === "awaiting") return status === "awaiting_customer_confirmation" || status === "worker_marked_complete";
  if (tab === "completed") return status === "completed" || status === "closed";
  return status === tab;
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
  const [tab, setTab] = useState<TabKey>("active");
  const [confirmFor, setConfirmFor] = useState<any | null>(null);
  const [disputeFor, setDisputeFor] = useState<any | null>(null);

  const { data } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("bookings")
        .select("*, categories(name), reviews(id, rating, comment)")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.worker_id).filter(Boolean)));
      let profMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      }
      return (rows ?? []).map((r: any) => ({ ...r, profiles: profMap[r.worker_id] ?? null }));
    },
  });

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
        {visible.length === 0 ? (
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
              {b.scheduled_at && <p className="text-xs text-muted-foreground mt-2">📅 {new Date(b.scheduled_at).toLocaleString()}</p>}
              {(b.estimated_amount ?? b.estimated_cost) != null && <p className="text-sm text-muted-foreground mt-1">Estimate: {fmtGHS(b.estimated_amount ?? b.estimated_cost)}</p>}
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

              <div className="mt-3 flex flex-wrap gap-2">
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
        <ConfirmModal booking={confirmFor} onClose={() => setConfirmFor(null)}
          onDone={() => { setConfirmFor(null); qc.invalidateQueries({ queryKey: ["my-bookings"] }); }} />
      )}
      {disputeFor && (
        <DisputeModal booking={disputeFor} onClose={() => setDisputeFor(null)}
          onDone={() => { setDisputeFor(null); qc.invalidateQueries({ queryKey: ["my-bookings"] }); }} />
      )}
    </AppShell>
  );
}

function ConfirmModal({ booking, onClose, onDone }: { booking: any; onClose: () => void; onDone: () => void }) {
  const [amountPaid, setAmountPaid] = useState(String(booking.final_amount ?? ""));
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [hireAgain, setHireAgain] = useState<boolean | null>(null);
  const [amountNote, setAmountNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const paidNum = Number(amountPaid);
  const mismatch = paidNum > 0 && booking.final_amount != null && Math.abs(paidNum - Number(booking.final_amount)) > 0.001;

  const submit = async () => {
    if (!paidNum || paidNum <= 0) return toast.error("Enter the amount you paid");
    if (rating < 1 || rating > 5) return toast.error("Please rate 1–5 stars");
    if (mismatch && !amountNote.trim()) return toast.error("Please explain the amount difference");
    if (!confirmed) return toast.error("Please confirm the statement");
    setSaving(true);
    const { error } = await supabase.rpc("customer_confirm_booking_completion", {
      _booking_id: booking.id,
      _amount_paid: paidNum,
      _rating: rating,
      _review_text: reviewText.trim() || undefined,
      _would_hire_again: hireAgain,
      _amount_note: amountNote.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Booking completed. Thank you for helping build trust on Skill Link.");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4">
      <div className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[95vh] overflow-y-auto">
        <h3 className="font-display font-bold text-lg">Confirm completion</h3>
        <p className="text-xs text-muted-foreground mt-1">{booking.profiles?.full_name ?? "Your pro"} · {booking.categories?.name ?? ""}</p>
        <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs space-y-1">
          {(booking.estimated_amount ?? booking.estimated_cost) != null && <p>Original estimate: <span className="font-semibold">GH₵{Number(booking.estimated_amount ?? booking.estimated_cost).toFixed(2)}</span></p>}
          <p>Worker reported: <span className="font-semibold">GH₵{Number(booking.final_amount ?? 0).toFixed(2)}</span></p>
          {booking.completion_note && <p className="italic mt-1">"{booking.completion_note}"</p>}
        </div>

        <label className="block mt-4 text-xs font-semibold">Amount you paid (GH₵)</label>
        <input type="number" min={1} step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"/>
        {mismatch && (
          <div className="mt-2 rounded-lg bg-warning/10 border border-warning/30 p-2 text-xs">
            <p className="font-semibold text-warning-foreground">Amount differs from the worker's report.</p>
            <textarea value={amountNote} onChange={e => setAmountNote(e.target.value)}
              placeholder="Please explain the difference…"
              className="mt-2 w-full rounded-lg border border-input bg-background p-2 text-xs min-h-[60px]"/>
          </div>
        )}

        <label className="block mt-4 text-xs font-semibold">Your rating *</label>
        <div className="mt-1 flex gap-1">
          {[1,2,3,4,5].map(n => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star className={`size-8 ${n <= rating ? "fill-gold text-gold" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>

        <label className="block mt-4 text-xs font-semibold">Written review (optional)</label>
        <textarea value={reviewText} onChange={e => setReviewText(e.target.value)}
          placeholder="Share a few words…"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[70px]"/>

        <p className="mt-4 text-xs font-semibold">Would you hire again?</p>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => setHireAgain(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${hireAgain === true ? "bg-success text-success-foreground border-success" : "border-border"}`}>Yes</button>
          <button type="button" onClick={() => setHireAgain(false)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${hireAgain === false ? "bg-destructive text-destructive-foreground border-destructive" : "border-border"}`}>No</button>
        </div>

        <label className="mt-4 flex items-start gap-2 p-3 rounded-xl border border-border cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 accent-primary"/>
          <span className="text-sm">I confirm the work was completed and that I paid {fmtGHS(paidNum || 0)}.</span>
        </label>

        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !confirmed || rating < 1} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-60">
            {saving ? "Submitting…" : "Confirm & submit"}
          </button>
        </div>
      </div>
    </div>
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
