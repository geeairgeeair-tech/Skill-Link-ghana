import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const CUSTOMER_CANCEL_REASONS = [
  { code: "changed_mind", label: "Changed my mind" },
  { code: "booked_by_mistake", label: "Booked by mistake" },
  { code: "found_another_solution", label: "Found another solution" },
  { code: "pro_taking_too_long", label: "Professional taking too long" },
  { code: "emergency", label: "Emergency" },
  { code: "financial", label: "Financial reasons" },
  { code: "other", label: "Other" },
];

export const WORKER_CANCEL_REASONS = [
  { code: "customer_unavailable", label: "Customer unavailable" },
  { code: "customer_requested", label: "Customer requested cancellation" },
  { code: "emergency", label: "Emergency" },
  { code: "unable_to_complete", label: "Unable to complete work" },
  { code: "outside_service_area", label: "Outside service area" },
  { code: "safety_concern", label: "Safety concern" },
  { code: "other", label: "Other" },
];

/** Statuses after which a cancellation counts as "late" (work already underway). */
export const LATE_CANCEL_STATUSES = [
  "accepted", "on_the_way", "worker_on_the_way", "arrived", "in_progress", "work_started",
];

export function cancelReasonLabel(role: string | null | undefined, code: string | null | undefined) {
  if (!code) return null;
  const list = role === "worker" ? WORKER_CANCEL_REASONS : CUSTOMER_CANCEL_REASONS;
  return list.find((r) => r.code === code)?.label ?? null;
}

export function CancelBookingModal({
  bookingId,
  as,
  bookingStatus,
  onClose,
  onDone,
}: {
  bookingId: string;
  as: "customer" | "worker";
  bookingStatus: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const reasons = as === "worker" ? WORKER_CANCEL_REASONS : CUSTOMER_CANCEL_REASONS;
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const late = LATE_CANCEL_STATUSES.includes(bookingStatus);

  const submit = async () => {
    if (!reason) return toast.error("Please choose a cancellation reason");
    if (reason === "other" && !note.trim()) return toast.error("Please explain your reason");
    setSaving(true);
    const { error } = await supabase.rpc(
      as === "worker" ? "worker_cancel_booking" : ("customer_cancel_booking" as any),
      { _booking_id: bookingId, _reason_code: reason, _note: note.trim() || undefined } as any,
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4">
      <div className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display font-bold text-lg">Cancel this booking</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Are you sure you want to cancel this booking? This action cannot be undone.
        </p>

        {late && (
          <div className="mt-3 rounded-xl bg-warning/15 border border-warning/40 p-3 text-xs inline-flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning-foreground" />
            <span>This booking is already in progress. Cancelling may affect your account history.</span>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {reasons.map((r) => (
            <label
              key={r.code}
              className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${reason === r.code ? "border-primary bg-primary-soft/40" : "border-border"}`}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r.code}
                checked={reason === r.code}
                onChange={() => setReason(r.code)}
                className="accent-primary"
              />
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder={reason === "other" ? "Please explain (required)…" : "Add a note (optional)…"}
          className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[70px]"
        />

        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-muted">
            Keep booking
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !reason}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground disabled:opacity-60"
          >
            {saving ? "Cancelling…" : "Yes, cancel booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
