import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Pencil, XCircle, CheckCircle2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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

  const { data, isLoading } = useQuery({
    queryKey: ["my-applications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: apps, error } = await supabase.from("job_applications")
        .select("id, status, quoted_price, estimated_start, message, created_at, job_id, decline_reason, job_requests(id, title, city, status, urgency, budget, booking_id, categories(name))")
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
    if (!confirm("Withdraw this application?")) return;
    const { error } = await supabase.from("job_applications").update({ status: "withdrawn" as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Application withdrawn");
    qc.invalidateQueries({ queryKey: ["my-applications"] });
    qc.invalidateQueries({ queryKey: ["my-application-for-job"] });
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
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
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
          return (
            <div key={a.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[a.status] ?? "bg-muted"}`}>
                  {a.status === "rejected" ? "not selected" : a.status}
                </span>
                <span className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              {a.status === "accepted" && bookingId ? (
                <Link to="/bookings/$bookingId" params={{ bookingId }} className="block">
                  <p className="font-semibold truncate">{job?.title ?? "Job"}</p>
                  <p className="text-xs text-muted-foreground truncate">{job?.categories?.name ?? "General"} · {job?.city ?? "Ghana"}</p>
                </Link>
              ) : (
                <Link to="/jobs/$id" params={{ id: a.job_id }} className="block">
                  <p className="font-semibold truncate">{job?.title ?? "Job"}</p>
                  <p className="text-xs text-muted-foreground truncate">{job?.categories?.name ?? "General"} · {job?.city ?? "Ghana"}</p>
                </Link>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="font-semibold text-primary">Your quote: GH₵{a.quoted_price}</span>
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
  const [amount, setAmount] = useState(String(app.quoted_price ?? ""));
  const [start, setStart] = useState(app.estimated_start ? new Date(app.estimated_start).toISOString().slice(0, 16) : "");
  const [message, setMessage] = useState(app.message ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid amount (GH₵1 or more).");
    if (!start) return toast.error("Please choose an expected arrival/start time.");
    if (message.trim().length < 3) return toast.error("Please write a short message.");
    setSubmitting(true);
    const { error } = await supabase.rpc("worker_update_job_application", {
      _application_id: app.id,
      _proposed_amount: amt,
      _estimated_start: new Date(start).toISOString(),
      _message: message.trim(),
      _note: null,
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
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
        <h3 className="font-display text-lg font-bold">Edit application</h3>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Proposed amount (GH₵) *</label>
          <input type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Expected arrival / start *</label>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Message *</label>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
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
