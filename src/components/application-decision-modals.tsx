import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared Customer-side application decision modals.
 * Used by the job detail applicants panel and by the professional profile when
 * it is opened from a specific job application. Both reuse the existing
 * customer_accept_job_application / customer_decline_job_application RPCs.
 */

export function ReviewAndConfirmModal({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: (bookingId: string | null) => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const p = app.profile;
  const wp = app.worker;

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("customer_accept_job_application", { _application_id: app.id });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Worker hired! Booking created.");
    onDone((data as any) ?? null);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => !saving && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[92vh] overflow-y-auto">
        <h3 className="font-display font-bold text-lg">Review & Confirm Worker</h3>
        <p className="text-xs text-muted-foreground mt-1">Confirm hiring this professional. This will create a booking and close the job.</p>

        <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-muted/50">
          <div className="size-12 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold">
            {p?.avatar_url ? <img src={p.avatar_url} alt="" className="size-full object-cover"/> : (p?.full_name?.[0]?.toUpperCase() ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="font-semibold truncate">{p?.full_name ?? "Worker"}</p>
              {wp?.verification_status === "approved" && <CheckCircle2 className="size-3.5 text-success"/>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {wp?.categories?.name ?? "Pro"}
              {wp?.rating ? ` · ★ ${wp.rating}` : " · New"}
              {wp?.jobs_completed != null ? ` · ${wp.jobs_completed} jobs` : ""}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-border p-3 text-xs space-y-1">
          <p><span className="text-muted-foreground">Proposed amount:</span> <span className="font-bold text-primary">GH₵{app.quoted_price}</span></p>
          {app.estimated_start && <p><span className="text-muted-foreground">Can start:</span> <span className="font-semibold">{new Date(app.estimated_start).toLocaleString()}</span></p>}
          {app.message && <p className="italic bg-muted/40 rounded p-2 mt-1">"{app.message}"</p>}
        </div>

        <label className="block mt-4 text-xs font-semibold">Optional note to worker</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder="Anything else the worker should know…"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"/>

        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-muted">Back</button>
          <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-60">
            {saving ? "Hiring…" : "Confirm and Hire Worker"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeclineApplicationModal({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 3) return toast.error("Please give a short reason (min 3 chars)");
    setSaving(true);
    const { error } = await supabase.rpc("customer_decline_job_application", {
      _application_id: app.id, _reason: reason.trim(),
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Application declined");
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => !saving && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border p-5">
        <h3 className="font-display font-bold text-lg">Decline application</h3>
        <p className="text-xs text-muted-foreground mt-1">The worker will be notified once. Applications stay on record.</p>
        <label className="block mt-3 text-xs font-semibold">Reason *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 500))} rows={3}
          placeholder="e.g. Chose another worker, price too high…"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"/>
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground disabled:opacity-60">
            {saving ? "Declining…" : "Confirm decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
