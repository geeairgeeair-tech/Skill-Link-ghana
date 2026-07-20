import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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

  const { data: job, isLoading } = useQuery({
    queryKey: ["job-request-brief", id],
    queryFn: async () => (await supabase.from("job_requests")
      .select("id, title, budget, status, customer_id, category_id, categories(name)").eq("id", id).maybeSingle()).data,
  });

  const { data: workerProfile } = useQuery({
    queryKey: ["worker-profile-self", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("worker_profiles")
      .select("verification_status, category_id, categories(name)").eq("user_id", user!.id).maybeSingle()).data,
  });

  const { data: existing } = useQuery({
    queryKey: ["my-application-for-job", id, user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("job_applications")
      .select("id, status, quoted_price, estimated_start, message")
      .eq("job_id", id).eq("worker_id", user!.id).maybeSingle()).data,
  });

  const [quotedPrice, setQuotedPrice] = useState<string>("");
  const [estStart, setEstStart] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  // hydrate on edit
  if (existing && quotedPrice === "" && estStart === "" && message === "") {
    setQuotedPrice(String(existing.quoted_price));
    setEstStart(existing.estimated_start ? new Date(existing.estimated_start).toISOString().slice(0,16) : "");
    setMessage(existing.message ?? "");
  }

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!job) return <div className="p-8 text-center"><p>Job not found.</p><Link to="/jobs" className="text-primary font-semibold">Back to board</Link></div>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ quoted_price: quotedPrice, estimated_start: estStart || undefined, message: message.trim() || undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setSubmitting(true);
    const payload = {
      quoted_price: parsed.data.quoted_price,
      estimated_start: parsed.data.estimated_start ? new Date(parsed.data.estimated_start).toISOString() : null,
      message: parsed.data.message ?? null,
    };
    let error;
    if (existing) {
      ({ error } = await supabase.from("job_applications").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("job_applications").insert({ job_id: id, worker_id: user.id, ...payload }));
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
      </div>
      <main className="mx-auto max-w-md px-5 -mt-3">
        <form onSubmit={onSubmit} className="rounded-2xl bg-card border border-border p-5 shadow-elevated space-y-4">
          {!canEditExisting && (
            <div className="rounded-lg bg-muted p-3 text-xs">This application is <b>{existing?.status}</b> and can no longer be edited.</div>
          )}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Your quoted price (GH₵) *</label>
            <input
              type="number" min={1} inputMode="numeric" required
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(e.target.value)}
              disabled={!canEditExisting}
              placeholder={(job as any).budget ? `Customer budget: GH₵${(job as any).budget}` : "e.g. 250"}
              className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Estimated arrival / start time</label>
            <input
              type="datetime-local"
              value={estStart}
              onChange={(e) => setEstStart(e.target.value)}
              disabled={!canEditExisting}
              className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Message (optional)</label>
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
