import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BackButton } from "@/components/back-button";
import { jobDurationLabel, jobTimingLabel } from "@/lib/job-timing";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkerEligibility } from "@/hooks/use-job-eligibility";

export const Route = createFileRoute("/_authenticated/jobs/$id/apply")({
  component: ApplyPage,
});

const schema = z.object({
  quoted_price: z.coerce.number().int().min(1, "Enter a valid price").max(10_000_000),
  estimated_start: z.string().optional(),
  message: z.string().max(1000).optional(),
});

function ApplyPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const { data: job, isLoading, isError, refetch } = useQuery({
    queryKey: ["job-request-brief", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_requests")
        .select("id, title, budget, timing_type, preferred_at, preferred_window, duration_type, duration_start_date, duration_end_date, status, customer_id, category_id, service_area_id, categories(name), service_areas(name)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const eligibility = useWorkerEligibility();

  const { data: existing } = useQuery({
    queryKey: ["my-application-for-job", id, user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("job_applications")
      .select("id, status, quoted_price, estimated_start, message")
      .eq("job_id", id).eq("worker_id", user!.id).maybeSingle()).data,
  });

  const [quotedPrice, setQuotedPrice] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [asapMode, setAsapMode] = useState<"asap" | "specific">("asap");
  const [todayTime, setTodayTime] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  // Prefill: existing application values, else the customer's budget.
  if (!hydrated && job) {
    setHydrated(true);
    if (existing) {
      setQuotedPrice(String(existing.quoted_price));
      setMessage(existing.message ?? "");
      if (existing.estimated_start) {
        const d = new Date(existing.estimated_start);
        const sameDay = d.toDateString() === new Date().toDateString();
        if (sameDay) {
          setAsapMode("specific");
          setTodayTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
        }
      }
    } else if ((job as any).budget != null) {
      setQuotedPrice(String((job as any).budget));
    }
  }


  if (isLoading || eligibility.loading) return (
    <div className="mx-auto max-w-md p-5 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
    </div>
  );
  if (isError) return (
    <div className="p-8 text-center space-y-3">
      <p className="font-semibold text-destructive">Couldn't load this job.</p>
      <button onClick={() => refetch()} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold">Retry</button>
    </div>
  );
  if (!job) return <div className="p-8 text-center"><p>Job not found.</p><Link to="/jobs" className="text-primary font-semibold">Back to board</Link></div>;

  const jobCatName = (job as any).categories?.name ?? "this category";
  const gateReason = existing
    ? null
    : eligibility.blockedReason(
        (job as any).status,
        (job as any).category_id ?? null,
        jobCatName,
        (job as any).service_area_id ?? null,
        (job as any).service_areas?.name ?? null,
      );


  if (gateReason) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6">
          <BackButton fallback="/jobs" />
          <h1 className="font-display text-2xl font-bold mt-2">Can't apply</h1>
        </div>
        <main className="mx-auto max-w-md px-5 -mt-3">
          <div className="rounded-2xl bg-card border border-border p-5 shadow-elevated text-sm">
            <p>{gateReason}</p>
            <Link to="/jobs" className="inline-block mt-4 text-primary font-semibold">Back to job board →</Link>
          </div>
        </main>
      </div>
    );
  }

  const timing = jobTimingLabel(job as any);
  const isAsapJob = timing.asap;

  const resolveEstimatedStart = (): string | null => {
    if (isAsapJob) {
      if (asapMode !== "specific" || !todayTime) return null;
      const [h, m] = todayTime.split(":").map(Number);
      const d = new Date();
      d.setHours(h ?? 0, m ?? 0, 0, 0);
      return d.toISOString();
    }
    // Scheduled job: reuse the customer's own scheduled slot; never a new date.
    return (job as any).preferred_at ?? null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isAsapJob && asapMode === "specific" && !todayTime) {
      toast.error("Choose the time you can arrive today.");
      return;
    }
    const parsed = schema.safeParse({ quoted_price: quotedPrice, message: message.trim() || undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setSubmitting(true);
    const payload = {
      quoted_price: parsed.data.quoted_price,
      estimated_start: resolveEstimatedStart(),
      message: parsed.data.message ?? null,
    };
    let error;
    if (existing) {
      ({ error } = await supabase.from("job_applications").update(payload).eq("id", existing.id));
    } else {
      const { error: rpcErr } = await supabase.rpc("worker_apply_to_job", {
        _job_id: id,
        _proposed_amount: parsed.data.quoted_price,
        _estimated_start: payload.estimated_start as string,
        _message: payload.message as string | undefined,
      });
      error = rpcErr;
    }
    setSubmitting(false);
    if (error) {
      if (error.code === "23505") toast.error("You've already applied to this job.");
      else if (error.code === "42501") toast.error("Only verified workers can apply. Please complete onboarding.");
      else toast.error(error.message);
      return;
    }
    toast.success(existing ? "Application updated" : "Application sent!");
    navigate({ to: "/worker/applications" });
  };

  const canEditExisting = !existing || existing.status === "pending";

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6">
        <BackButton fallback="/jobs" />
        <h1 className="font-display text-2xl font-bold mt-2">{existing ? "Edit application" : "Apply for job"}</h1>
        <p className="text-sm opacity-80">{(job as any).title}</p>
        {(() => { const d = jobDurationLabel(job as any); return d ? <p className="text-xs opacity-80 mt-1">{d.text}</p> : null; })()}
      </div>
      <main className="mx-auto max-w-md px-5 -mt-3">
        <form onSubmit={onSubmit} className="rounded-2xl bg-card border border-border p-5 shadow-elevated space-y-4">
          {!canEditExisting && (
            <div className="rounded-lg bg-muted p-3 text-xs">This application is <b>{existing?.status}</b> and can no longer be edited.</div>
          )}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Your proposed amount (GH₵) *</label>
            <input
              type="number" min={1} inputMode="numeric" required
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(e.target.value)}
              disabled={!canEditExisting}
              placeholder="e.g. 250"
              className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {(job as any).budget != null
                ? `Prefilled from the customer's budget (GH₵${Number((job as any).budget).toLocaleString("en-GH")}). You can change it — the customer's budget stays as posted.`
                : "The customer didn't set a budget."}
            </p>
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
                        name="asap-mode"
                        checked={asapMode === opt.key}
                        disabled={!canEditExisting}
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
                        disabled={!canEditExisting}
                        className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold">📅 {timing.text}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  The customer set this date and time window. Applying means you're available then.
                </p>
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Message / additional note (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              disabled={!canEditExisting}
              rows={4}
              placeholder="Tell the customer why you're the right pro for the job."
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{message.length}/1000</p>
          </div>

          {canEditExisting && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
            >
              {submitting ? "Sending…" : existing ? "Save changes" : "Submit application"}
            </button>
          )}
          <p className="text-[11px] text-muted-foreground text-center">
            Customer contact details are shared only after your application is accepted.
          </p>
        </form>
      </main>
    </div>
  );
}
