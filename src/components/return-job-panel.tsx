import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ImageUpload } from "@/components/image-upload";

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting worker response",
  info_requested: "More information requested",
  accepted: "Return visit accepted",
  scheduled: "Return visit scheduled",
  declined: "Declined",
  completed: "Resolved",
};

/**
 * Return-job panel. Customers can request a return visit on a completed booking;
 * workers can accept, schedule, ask for more info, or decline.
 */
export function ReturnJobPanel({
  bookingId, userId, isWorker, isCustomer, bookingStatus, returnEligible = false, completedAt = null,
}: {
  bookingId: string; userId: string; isWorker: boolean; isCustomer: boolean; bookingStatus: string;
  /** Only repair-based categories allow return visits (categories.return_eligible). */
  returnEligible?: boolean;
  completedAt?: string | null;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: requests } = useQuery({
    queryKey: ["return-requests", bookingId],
    queryFn: async () => (await supabase.from("return_requests").select("*").eq("booking_id", bookingId)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const open = (requests ?? []).find((r: any) => ["pending", "info_requested", "accepted", "scheduled"].includes(r.status));
  const history = (requests ?? []).filter((r: any) => r !== open);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["return-requests", bookingId] });
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
    qc.invalidateQueries({ queryKey: ["worker-returns"] });
  };

  const request = async () => {
    if (reason.trim().length < 10) return toast.error("Please explain the issue (min 10 characters)");
    setBusy(true);
    const { error } = await supabase.rpc("customer_request_return", {
      _booking_id: bookingId, _reason: reason.trim(), _photos: photos as any,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Return request sent");
    setReason(""); setPhotos([]); setShowForm(false); refresh();
  };

  const respond = async (action: "accept" | "schedule" | "request_info" | "decline") => {
    if (!open) return;
    if ((action === "request_info" || action === "decline") && note.trim().length < 3) {
      return toast.error(action === "decline" ? "Please give a reason" : "Say what information you need");
    }
    if (action === "schedule" && !when) return toast.error("Pick a date and time");
    setBusy(true);
    const { error } = await supabase.rpc("worker_respond_return", {
      _return_id: open.id, _action: action,
      _note: note.trim() || null,
      _scheduled_at: action === "schedule" ? new Date(when).toISOString() : null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(action === "decline" ? "Return declined" : action === "request_info" ? "Question sent" : "Return visit confirmed");
    setNote(""); setWhen(""); refresh();
  };

  const sendInfo = async () => {
    if (!open) return;
    if (reply.trim().length < 3) return toast.error("Please add details");
    setBusy(true);
    const { error } = await supabase.rpc("customer_reply_return_info", { _return_id: open.id, _reply: reply.trim() } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Sent");
    setReply(""); refresh();
  };

  const RETURN_WINDOW_DAYS = 5;
  const withinWindow = completedAt
    ? Date.now() - new Date(completedAt).getTime() <= RETURN_WINDOW_DAYS * 24 * 3600 * 1000
    : true;
  const canRequest = isCustomer && returnEligible && withinWindow && bookingStatus === "completed" && !open;
  if (!open && !canRequest && (requests ?? []).length === 0) return null;

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <h3 className="font-display font-bold inline-flex items-center gap-2"><RotateCcw className="size-4 text-primary" /> Return job</h3>

      {canRequest && !showForm && (
        <>
          <p className="text-sm text-muted-foreground">Still not right? Ask your professional to come back.</p>
          <button onClick={() => setShowForm(true)} className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold">
            Request a return visit
          </button>
        </>
      )}

      {canRequest && showForm && (
        <div className="space-y-3">
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what still needs attention…"
            className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          <ImageUpload bucket="job-media" userId={userId} prefix="return" multiple max={5} returnPath
            label="Photos (optional)" value={photos} onChange={setPhotos} />
          <div className="flex gap-2">
            <button onClick={request} disabled={busy} className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50">
              {busy ? "Sending…" : "Send request"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-xl border border-input px-4 py-2.5 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      {open && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary-soft text-primary">
              {STATUS_LABEL[open.status] ?? open.status}
            </span>
            <span className="text-[11px] text-muted-foreground">{new Date(open.created_at).toLocaleDateString()}</span>
          </div>
          <p className="text-sm">{open.reason}</p>
          {Array.isArray(open.photos) && open.photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {(open.photos as string[]).map((p) => (
                <img key={p} src={p} alt="Return issue" className="size-20 rounded-lg object-cover border border-border" />
              ))}
            </div>
          )}
          {open.scheduled_at && (
            <p className="text-xs text-muted-foreground">Scheduled for {new Date(open.scheduled_at).toLocaleString()}</p>
          )}
          {open.info_request && (
            <p className="text-xs"><span className="font-semibold">Worker asked:</span> {open.info_request}</p>
          )}
          {open.customer_info_reply && (
            <p className="text-xs"><span className="font-semibold">Customer replied:</span> {open.customer_info_reply}</p>
          )}

          {isWorker && ["pending", "info_requested"].includes(open.status) && (
            <div className="space-y-2 border-t border-border pt-3">
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Note, question, or reason for declining"
                className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => respond("accept")} disabled={busy} className="rounded-xl bg-success text-success-foreground py-2.5 text-sm font-semibold disabled:opacity-50">Accept return</button>
                <button onClick={() => respond("schedule")} disabled={busy} className="rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50">Schedule visit</button>
                <button onClick={() => respond("request_info")} disabled={busy} className="rounded-xl border border-input py-2.5 text-sm font-semibold disabled:opacity-50">Ask for info</button>
                <button onClick={() => respond("decline")} disabled={busy} className="rounded-xl border border-destructive/40 text-destructive py-2.5 text-sm font-semibold disabled:opacity-50">Decline</button>
              </div>
            </div>
          )}

          {isCustomer && open.status === "info_requested" && (
            <div className="space-y-2 border-t border-border pt-3">
              <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder="Answer the professional's question"
                className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
              <button onClick={sendInfo} disabled={busy} className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Send reply</button>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase font-bold text-muted-foreground">History</p>
          {history.map((r: any) => (
            <div key={r.id} className="text-xs text-muted-foreground flex justify-between gap-2">
              <span className="truncate">{r.reason}</span>
              <span className="shrink-0 capitalize">{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
