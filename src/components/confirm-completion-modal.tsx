import { useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAcceptedEstimate } from "@/lib/accepted-estimates";

const fmt = (n: number) => `GH₵${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ConfirmCompletionModal({ booking, onClose, onDone }: { booking: any; onClose: () => void; onDone: () => void }) {
  const acceptedEstimate = useAcceptedEstimate(booking?.id);
  const [amountPaid, setAmountPaid] = useState(String(booking.final_amount ?? ""));
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [hireAgain, setHireAgain] = useState<boolean | null>(null);
  const [amountNote, setAmountNote] = useState("");
  const [resolution, setResolution] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const paidNum = Number(amountPaid);
  const mismatch = paidNum > 0 && booking.final_amount != null && Math.abs(paidNum - Number(booking.final_amount)) > 0.001;
  const hadReturn = Number(booking.return_count ?? 0) > 0;

  const submit = async () => {
    if (!paidNum || paidNum <= 0) return toast.error("Enter the amount you paid");
    if (rating < 1 || rating > 5) return toast.error("Please rate 1–5 stars");
    if (mismatch && !amountNote.trim()) return toast.error("Please explain the amount difference");
    if (hadReturn && !resolution) return toast.error("Please tell us whether the issue was resolved");
    if (!confirmed) return toast.error("Please confirm the statement");
    setSaving(true);
    const { error } = await supabase.rpc("customer_confirm_booking_completion", {
      _booking_id: booking.id,
      _amount_paid: paidNum,
      _rating: rating,
      _review_text: reviewText.trim() || undefined,
      _would_hire_again: hireAgain ?? undefined,
      _amount_note: amountNote.trim() || undefined,
      _resolution: hadReturn ? resolution : undefined,
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
        <p className="text-xs text-muted-foreground mt-1">{booking.profiles?.full_name ?? booking.worker?.full_name ?? "Your pro"} · {booking.categories?.name ?? ""}</p>
        <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs space-y-1">
          {booking.budget != null && <p>Customer budget: <span className="font-semibold">{fmt(Number(booking.budget))}</span></p>}
          {acceptedEstimate != null && <p>Accepted estimate: <span className="font-semibold">{fmt(acceptedEstimate)}</span></p>}
          <p>Worker reported: <span className="font-semibold">{fmt(Number(booking.final_amount ?? 0))}</span></p>
          {booking.completion_note && <p className="italic mt-1">"{booking.completion_note}"</p>}
        </div>

        {booking.final_amount_reason && (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary-soft/60 p-3 text-xs space-y-1">
            <p className="font-semibold text-primary uppercase tracking-wide text-[10px]">
              Why the final amount differs from the estimate
            </p>
            <p className="font-semibold">{booking.final_amount_reason}</p>
            {booking.final_amount_note && <p className="italic text-muted-foreground">"{booking.final_amount_note}"</p>}
            <p className="text-muted-foreground">Please review this explanation before confirming payment.</p>
          </div>
        )}


        <label className="block mt-4 text-xs font-semibold">Amount you paid (GH₵)</label>
        <input type="number" min={1} step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm" />
        {mismatch && (
          <div className="mt-2 rounded-lg bg-warning/10 border border-warning/30 p-2 text-xs">
            <p className="font-semibold text-warning-foreground">Amount differs from the worker's report.</p>
            <textarea value={amountNote} onChange={(e) => setAmountNote(e.target.value)}
              placeholder="Please explain the difference…"
              className="mt-2 w-full rounded-lg border border-input bg-background p-2 text-xs min-h-[60px]" />
          </div>
        )}

        <label className="block mt-4 text-xs font-semibold">Your rating *</label>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star className={`size-8 ${n <= rating ? "fill-gold text-gold" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>

        <label className="block mt-4 text-xs font-semibold">Written review (optional)</label>
        <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)}
          placeholder="Share a few words…"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[70px]" />

        <p className="mt-4 text-xs font-semibold">Would you hire again?</p>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => setHireAgain(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${hireAgain === true ? "bg-success text-success-foreground border-success" : "border-border"}`}>Yes</button>
          <button type="button" onClick={() => setHireAgain(false)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${hireAgain === false ? "bg-destructive text-destructive-foreground border-destructive" : "border-border"}`}>No</button>
        </div>

        {hadReturn && (
          <>
            <p className="mt-4 text-xs font-semibold">Was the return issue resolved?</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                { v: "completely", l: "Completely" },
                { v: "partially", l: "Partially" },
                { v: "not_resolved", l: "Not resolved" },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => setResolution(o.v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${resolution === o.v ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="mt-4 flex items-start gap-2 p-3 rounded-xl border border-border cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-primary" />
          <span className="text-sm">I confirm the work was completed and that I paid {fmt(paidNum || 0)}.</span>
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
