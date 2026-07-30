import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PauseCircle, PlayCircle, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ImageUpload } from "@/components/image-upload";

/** Worker work-session controls: pause/resume plus progress & completion photos. */
export function WorkProgressPanel({
  booking, userId, isWorker,
}: { booking: any; userId: string; isWorker: boolean }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPause, setShowPause] = useState(false);

  const progress: string[] = Array.isArray(booking.progress_photos) ? booking.progress_photos : [];
  const completion: string[] = Array.isArray(booking.completion_photos) ? booking.completion_photos : [];
  const status: string = booking.status;
  const canEdit = isWorker && ["arrived", "in_progress"].includes(status);
  const refresh = () => qc.invalidateQueries({ queryKey: ["booking-detail", booking.id] });

  if (!canEdit && progress.length === 0 && completion.length === 0 && !booking.is_paused) return null;

  const rpc = async (fn: "worker_pause_work" | "worker_resume_work") => {
    if (fn === "worker_pause_work" && reason.trim().length < 3) return toast.error("Please give a reason for pausing");
    setBusy(true);
    const { error } = await supabase.rpc(fn as any,
      fn === "worker_pause_work" ? { _booking_id: booking.id, _reason: reason.trim() } : { _booking_id: booking.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(fn === "worker_pause_work" ? "Work paused" : "Work resumed");
    setReason(""); setShowPause(false); refresh();
  };

  const addPhotos = async (kind: "progress" | "completion", urls: string[]) => {
    const existing = kind === "progress" ? progress : completion;
    const added = urls.filter((u) => !existing.includes(u));
    if (!added.length) return;
    const { error } = await supabase.rpc("booking_add_photos", { _booking_id: booking.id, _kind: kind, _urls: added as any } as any);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <h3 className="font-display font-bold text-sm inline-flex items-center gap-2"><Camera className="size-4 text-primary" /> Work progress</h3>

      {booking.is_paused && (
        <div className="rounded-xl bg-warning/15 border border-warning/30 p-3 text-sm">
          <p className="font-semibold inline-flex items-center gap-1"><PauseCircle className="size-4" /> Work paused</p>
          {booking.pause_reason && <p className="text-xs text-muted-foreground mt-0.5">{booking.pause_reason}</p>}
        </div>
      )}

      {isWorker && status === "in_progress" && (
        booking.is_paused ? (
          <button onClick={() => rpc("worker_resume_work")} disabled={busy}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50">
            <PlayCircle className="size-4" /> Resume work
          </button>
        ) : showPause ? (
          <div className="space-y-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you pausing? (e.g. waiting for materials)"
              className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => rpc("worker_pause_work")} disabled={busy} className="flex-1 rounded-xl bg-warning text-warning-foreground py-2.5 text-sm font-semibold disabled:opacity-50">Pause work</button>
              <button onClick={() => setShowPause(false)} className="rounded-xl border border-input px-4 py-2.5 text-sm font-semibold">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowPause(true)} className="rounded-xl border border-input px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-1">
            <PauseCircle className="size-4" /> Pause work
          </button>
        )
      )}

      {canEdit ? (
        <div className="space-y-3">
          <ImageUpload bucket="job-media" userId={userId} prefix="progress" multiple max={10}
            label="Progress photos" hint="Show the customer how the job is going."
            value={progress} onChange={(urls) => addPhotos("progress", urls)} />
          <ImageUpload bucket="job-media" userId={userId} prefix="completion" multiple max={10}
            label="Completion photos" hint="Attach before you mark the job complete."
            value={completion} onChange={(urls) => addPhotos("completion", urls)} />
        </div>
      ) : (
        <>
          {progress.length > 0 && <PhotoGrid label="Progress photos" urls={progress} />}
          {completion.length > 0 && <PhotoGrid label="Completion photos" urls={completion} />}
        </>
      )}
    </section>
  );
}

function PhotoGrid({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold mb-1 text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => <img key={u} src={u} alt={label} className="size-20 rounded-xl object-cover border border-border" />)}
      </div>
    </div>
  );
}
