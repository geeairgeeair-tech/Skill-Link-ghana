import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const DECLINE_REASONS = [
  { code: "schedule_conflict", label: "Schedule conflict" },
  { code: "too_far", label: "Too far from my service area" },
  { code: "budget_low", label: "Budget is too low" },
  { code: "no_equipment", label: "I don't have the required equipment" },
  { code: "unavailable", label: "I'm currently unavailable" },
  { code: "unclear_details", label: "Job details are unclear" },
  { code: "safety_concern", label: "Safety concern" },
  { code: "wrong_category", label: "Wrong category or service" },
  { code: "other", label: "Other" },
] as const;

export function DeclineBookingModal({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void }) {
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
          {DECLINE_REASONS.map((r) => (
            <label key={r.code} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${reason === r.code ? "border-primary bg-primary-soft/40" : "border-border"}`}>
              <input type="radio" name="reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} className="accent-primary" />
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={reason === "other" ? "Please explain (required)…" : "Add a note (optional)…"}
          className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[70px]"
        />
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
