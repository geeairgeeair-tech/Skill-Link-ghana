import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Pencil, XCircle, CheckCircle2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { jobTimingLabel, jobDurationLabel } from "@/lib/job-timing";


export const Route = createFileRoute("/_authenticated/worker/applications")({
  component: MyApplicationsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-primary-soft text-primary",
  accepted: "bg-success/20 text-success",
  rejected: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

function MyApplicationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-applications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: apps, error } = await supabase.from("job_applications")
        .select("id, status, quoted_price, estimated_start, message, created_at, job_id, decline_reason, job_requests(id, title, city, service_area, status, urgency, budget, booking_id, timing_type, preferred_at, preferred_window, duration_type, duration_start_date, duration_end_date, categories(name), service_areas(name))")

        .eq("worker_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = apps ?? [];
      // For accepted apps, prefer the booking linked via job_requests.booking_id;
      // fall back to a lookup by job_application_id on bookings.
      const acceptedNoBooking = rows.filter((a: any) => a.status === "accepted" && !a.job_requests?.booking_id).map((a: any) => a.id);
      let bookingByApp: Record<string, string> = {};
      if (acceptedNoBooking.length) {
        const { data: bks } = await supabase.from("bookings")
          .select("id, job_application_id").in("job_application_id", acceptedNoBooking);
        (bks ?? []).forEach((b: any) => { bookingByApp[b.job_application_id] = b.id; });
      }
      return rows.map((a: any) => ({
        ...a,
        booking_id: a.job_requests?.booking_id ?? bookingByApp[a.id] ?? null,
      }));
    },
  });

  const withdraw = async (id: string) => {
    const reason = prompt("Withdraw this application? Add an optional reason for the customer:");
    if (reason === null) return;
    const { error } = await supabase.rpc("worker_withdraw_application", {
      _application_id: id,
      _reason: reason.trim() || null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Application withdrawn");
    qc.invalidateQueries({ queryKey: ["my-applications"] });
    qc.invalidateQueries({ queryKey: ["my-application-for-job"] });
    qc.invalidateQueries({ queryKey: ["worker-app-count"] });
  };


  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <div className="mb-2"><BackButton fallback="/jobs" className="text-primary-foreground/90 hover:text-primary-foreground" /></div>
          <h1 className="font-display text-2xl font-bold">My applications</h1>
          <p className="text-sm opacity-80">Jobs you've applied to.</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm">
            <p className="font-semibold text-destructive">Couldn't load your applications.</p>
            <button onClick={() => refetch()} className="mt-3 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold">Retry</button>
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <FileText className="size-8 mx-auto text-muted-foreground/50 mb-2"/>
            <p className="font-semibold text-foreground">No applications yet</p>
            <Link to="/jobs" className="mt-3 inline-block text-primary font-semibold">Browse the job board →</Link>
          </div>
        ) : (data ?? []).map((a: any) => {
          const job = a.job_requests;
          const canEdit = a.status === "pending" && job?.status === "open";
          const bookingId = a.booking_id as string | null;
          const area = job?.service_areas?.name ?? job?.service_area ?? job?.city ?? "Ghana";
          const timing = job ? jobTimingLabel(job) : null;
          const duration = job ? jobDurationLabel(job) : null;
          const head = (
            <>
              <p className="font-semibold truncate">{job?.title ?? "Job"}</p>
              <p className="text-xs text-muted-foreground truncate">{job?.categories?.name ?? "General"} · {area}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {timing && (timing.asap
                  ? <span className="font-semibold text-primary">⚡ ASAP</span>
                  : <span>📅 {timing.text}</span>)}
                {duration && <span>{duration.text}</span>}
                {job?.budget != null && <span className="font-semibold text-primary">Budget GH₵{Number(job.budget).toLocaleString("en-GH")}</span>}
              </div>
            </>
          );
          return (
            <div key={a.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[a.status] ?? "bg-muted"}`}>
                  {a.status === "rejected" ? "not selected" : a.status}
                </span>
                <span className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              {a.status === "accepted" && bookingId ? (
                <Link to="/bookings/$bookingId" params={{ bookingId }} className="block">{head}</Link>
              ) : (
                <Link to="/jobs/$id" params={{ id: a.job_id }} className="block">{head}</Link>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-semibold text-primary">Your quote: GH₵{Number(a.quoted_price).toLocaleString("en-GH")}</span>
                {a.estimated_start && <span className="text-muted-foreground">Start: {new Date(a.estimated_start).toLocaleString()}</span>}
              </div>

              {a.message && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">"{a.message}"</p>}
              {a.status === "rejected" && a.decline_reason && (
                <p className="mt-2 text-[11px] text-muted-foreground italic">Customer note: "{a.decline_reason}"</p>
              )}
              {a.status === "accepted" && (
                <div className="mt-2 rounded-lg bg-success/10 p-2 text-xs text-success inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3.5"/> Accepted — you were hired.
                </div>
              )}
              <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                {a.status === "accepted" && bookingId && (
                  <>
                    <Link to="/bookings/$bookingId" params={{ bookingId }} className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1">
                      Open Booking
                    </Link>
                    <Link to="/chat/$bookingId" params={{ bookingId }} className="flex-1 h-9 rounded-lg border border-border text-xs font-semibold inline-flex items-center justify-center gap-1">
                      Chat
                    </Link>
                  </>
                )}
                {canEdit && (
                  <>
                    <button onClick={() => setEditing(a)} className="flex-1 h-9 rounded-lg border border-border text-xs font-semibold inline-flex items-center justify-center gap-1">
                      <Pencil className="size-3.5"/> Edit
                    </button>
                    <button onClick={() => withdraw(a.id)} className="flex-1 h-9 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold inline-flex items-center justify-center gap-1">
                      <XCircle className="size-3.5"/> Withdraw
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {editing && <EditApplicationModal app={editing} onClose={() => setEditing(null)} />}
    </AppShell>
  );
}

function EditApplicationModal({ app, onClose }: { app: any; onClose: () => void }) {
  const qc = useQueryClient();
  const job = app.job_requests;
  const timing = job ? jobTimingLabel(job) : null;
  const isAsapJob = timing?.asap ?? false;
  const duration = job ? jobDurationLabel(job) : null;

  const [amount, setAmount] = useState(String(app.quoted_price ?? ""));
  const [message, setMessage] = useState(app.message ?? "");
  const [asapMode, setAsapMode] = useState<"asap" | "specific">("asap");
  const [todayTime, setTodayTime] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Hydrate timing choice from the existing application.
  useEffect(() => {
    if (isAsapJob && app.estimated_start) {
      const d = new Date(app.estimated_start);
      const sameDay = d.toDateString() === new Date().toDateString();
      if (sameDay) {
        setAsapMode("specific");
        setTodayTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      }
    }
  }, []);

  const resolveEstimatedStart = (): string | null => {
    if (isAsapJob) {
      if (asapMode !== "specific" || !todayTime) return null;
      const [h, m] = todayTime.split(":").map(Number);
      const d = new Date();
      d.setHours(h ?? 0, m ?? 0, 0, 0);
      return d.toISOString();
    }
    // Scheduled job: reuse the customer's own scheduled slot; never a new date.
    return job?.preferred_at ?? null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid amount (GH₵1 or more).");
    if (isAsapJob && asapMode === "specific" && !todayTime) {
      return toast.error("Choose the time you can arrive today.");
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("worker_update_job_application", {
      _application_id: app.id,
      _proposed_amount: amt,
      _estimated_start: resolveEstimatedStart(),
      _message: message.trim() || null,
      _note: app.note ?? null,
    } as any);
    setSubmitting(false);
    if (error) {
      console.error("[worker_update_job_application]", error);
      return toast.error(error.message || "Could not update application.");
    }
    toast.success("Application updated");
    qc.invalidateQueries({ queryKey: ["my-applications"] });
    qc.invalidateQueries({ queryKey: ["my-application-for-job"] });
    qc.invalidateQueries({ queryKey: ["job-applicants", app.job_id] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => !submitting && onClose()}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div>
          <h3 className="font-display text-lg font-bold">Edit application</h3>
          <p className="text-sm text-muted-foreground">{job?.title ?? "Job"}</p>
          {duration && <p className="text-xs text-muted-foreground mt-1">{duration.text}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">Your proposed amount (GH₵) *</label>
          <input
            type="number" min={1} inputMode="numeric" required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {job?.budget != null && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Customer's budget: GH₵{Number(job.budget).toLocaleString("en-GH")}. You can change your quote.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground">Customer's timing</p>
          {isAsapJob ? (
            <>
              <p className="mt-1 text-sm font-semibold text-primary">⚡ ASAP</p>
              <div className="mt-3 space-y-2">
                {([
                  { key: "asap", label: "I can come ASAP" },
                  { key: "specific", label: "Specific time today" },
                ] as const).map((opt) => (
                  <label key={opt.key} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${asapMode === opt.key ? "border-primary bg-primary-soft" : "border-border"}`}>
                    <input
                      type="radio"
                      name="edit-asap-mode"
                      checked={asapMode === opt.key}
                      onChange={() => setAsapMode(opt.key)}
                    />
                    <span className="font-medium">{opt.label}</span>
                  </label>
                ))}
                {asapMode === "specific" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Time today *</label>
                    <input
                      type="time"
                      value={todayTime}
                      onChange={(e) => setTodayTime(e.target.value)}
                      className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold">📅 {timing?.text}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                The customer set this date and time window. Your application confirms you're available then.
              </p>
            </>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground">Message / additional note (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder="Tell the customer why you're the right pro for the job."
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{message.length}/1000</p>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" disabled={submitting} onClick={onClose} className="flex-1 h-12 rounded-xl border border-border font-semibold">Cancel</button>
          <button type="submit" disabled={submitting} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
