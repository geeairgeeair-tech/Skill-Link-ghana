import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtGHS, useEstimates } from "@/components/booking-estimate";

const HIGHER = [
  "Additional materials were required",
  "Material prices changed",
  "Customer requested extra work",
  "Hidden damage was discovered",
  "Emergency work was added",
  "Other",
];
const LOWER = [
  "Fewer materials were used",
  "Work took less time",
  "Discount applied",
  "Some work was not required",
  "Other",
];

export function CompleteJobModal({ bookingId, onClose, onDone }: {
  bookingId: string; onClose: () => void; onDone: () => void;
}) {
  const { data: estimates = [] } = useEstimates(bookingId);
  const approved = estimates.find((e) => e.status === "approved") ?? null;

  const [amount, setAmount] = useState<string>(approved ? String(approved.total) : "");
  const [reason, setReason] = useState<string>("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const final = Number(amount || 0);
  const diff = approved ? final - Number(approved.total) : 0;
  const needsReason = !!approved && final > 0 && diff !== 0;
  const options = diff > 0 ? HIGHER : LOWER;

  const submit = async () => {
    if (final <= 0) return toast.error("Enter the final amount");
    if (!confirmed) return toast.error("Please confirm the work is completed");
    const finalReason = reason === "Other" ? other.trim() : reason;
    if (needsReason && finalReason.length < 3) return toast.error("Please choose a reason for the difference");
    setSaving(true);
    const { error } = await supabase.rpc("worker_mark_booking_completed", {
      _booking_id: bookingId,
      _final_amount: final,
      _completion_note: note.trim() || null,
      _variance_reason: needsReason ? finalReason : null,
      _variance_note: needsReason ? other.trim() || null : null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Completion submitted — waiting for customer confirmation");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-bold">Complete job</h3>

        {approved && (
          <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Approved estimate</span><span className="font-semibold">{fmtGHS(approved.total)}</span></div>
            {final > 0 && (
              <div className="flex justify-between">
                <span>Difference</span>
                <span className={diff > 0 ? "text-destructive font-semibold" : diff < 0 ? "text-success font-semibold" : "font-semibold"}>{fmtGHS(diff)}</span>
              </div>
            )}
          </div>
        )}

        <label className="block">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Final amount (GH₵)</p>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" inputMode="decimal"
            className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
        </label>

        {needsReason && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Why is the final amount {diff > 0 ? "higher" : "lower"}?
            </p>
            {options.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="radio" name="variance" checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
                {r}
              </label>
            ))}
            {reason === "Other" && (
              <textarea value={other} onChange={(e) => setOther(e.target.value)} rows={2} placeholder="Explain briefly"
                className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
            )}
          </div>
        )}

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Completion note (optional)"
          className="w-full rounded-xl border border-input bg-background p-3 text-sm" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="accent-primary size-4" />
          I confirm the work is completed
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-muted text-sm font-semibold">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? "Submitting…" : "Submit completion"}
          </button>
        </div>
      </div>
    </div>
  );
}
