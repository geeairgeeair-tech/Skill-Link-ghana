import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Zap, AlertTriangle, Calendar, Pencil, CheckCircle2, FileText, User } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SignedImage } from "./jobs.index";
import { LocationMap } from "@/components/location-map";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
  component: JobDetail,
});

function SignedMedia({ path, type }: { path: string; type: "image"|"video" }) {
  const { data } = useQuery({
    queryKey: ["signed-url", path],
    queryFn: async () => (await supabase.storage.from("job-media").createSignedUrl(path, 3600)).data?.signedUrl ?? null,
    staleTime: 50*60*1000,
  });
  if (!data) return <div className="aspect-square bg-muted rounded-xl" />;
  return type === "image"
    ? <img src={data} className="w-full rounded-xl object-cover" />
    : <video src={data} controls className="w-full rounded-xl bg-black" />;
}

function JobDetail() {
  const { id } = Route.useParams();
  const { user, role } = useAuth();
  const { data: job, isLoading } = useQuery({
    queryKey: ["job-request", id],
    queryFn: async () => (await supabase.from("job_requests")
      .select("id, title, description, budget, city, status, urgency, preferred_at, media, created_at, customer_id, category_id, lat, lng, categories(name), profiles!job_requests_customer_id_fkey(full_name, city, avatar_url)")
      .eq("id", id).maybeSingle()).data,
  });
  const { data: jobAddress } = useQuery({
    queryKey: ["job-request-address", id, user?.id],
    enabled: !!user && !!job && (job as any).customer_id === user.id,
    queryFn: async () => (await supabase.rpc("get_job_request_address", { _id: id })).data as string | null,
  });
  // Worker verification status + category (gates Apply)
  const { data: workerProfile } = useQuery({
    queryKey: ["worker-profile-self", user?.id],
    enabled: !!user && role === "worker",
    queryFn: async () => (await supabase.from("worker_profiles")
      .select("verification_status, category_id, categories(name)").eq("user_id", user!.id).maybeSingle()).data,
  });

  // Existing application by this worker for this job
  const { data: myApp } = useQuery({
    queryKey: ["my-application-for-job", id, user?.id],
    enabled: !!user && role === "worker",
    queryFn: async () => (await supabase.from("job_applications")
      .select("id, status, quoted_price").eq("job_id", id).eq("worker_id", user!.id).maybeSingle()).data,
  });

  // Application count for customer (own job)
  const { data: appCount } = useQuery({
    queryKey: ["app-count-for-job", id, user?.id],
    enabled: !!user && !!job && (job as any).customer_id === user.id,
    queryFn: async () => {
      const { count } = await supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("job_id", id);
      return count ?? 0;
    },
  });

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!job) return <div className="p-8 text-center"><p>Job not found.</p><Link to="/jobs" className="text-primary font-semibold">Back to board</Link></div>;

  const media: any[] = Array.isArray((job as any).media) ? (job as any).media : [];
  const cust = (job as any).profiles;
  const isVerifiedWorker = workerProfile?.verification_status === "approved";
  const isPendingOrRejected = role === "worker" && !!workerProfile && workerProfile.verification_status !== "approved";
  const isOwner = user?.id === (job as any).customer_id;
  const jobCategoryName = (job as any).categories?.name ?? "this category";
  const categoryMatches = isVerifiedWorker && workerProfile?.category_id === (job as any).category_id;

  // Limited preview for pending/rejected workers who don't own the post
  if (isPendingOrRejected && !isOwner) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6">
          <BackButton fallback="/jobs" />
        </div>
        <main className="mx-auto max-w-md px-5 -mt-3 space-y-4">
          <div className="rounded-2xl bg-card border border-border p-5 shadow-elevated">
            <p className="text-xs uppercase font-bold text-primary tracking-wide">{jobCategoryName}</p>
            <h1 className="font-display text-xl font-bold mt-1">{(job as any).title}</h1>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{(job as any).service_area ?? (job as any).city ?? "Ghana"}</span>
              {(job as any).budget ? <span className="font-semibold text-primary">Budget GH₵{(job as any).budget}</span> : null}
              {(job as any).urgency && (job as any).urgency !== "normal" && <span className="uppercase text-[10px] font-bold">{(job as any).urgency}</span>}
            </div>
          </div>
          <div className="rounded-2xl bg-gold/10 border border-gold/30 p-4 text-sm">
            <p className="font-semibold mb-1">Verification required</p>
            <p className="text-xs text-muted-foreground">
              Your account is <b>{workerProfile!.verification_status}</b>. Full job details, customer information and applications unlock after admin approval.
            </p>
            <Link to="/worker/dashboard" className="inline-block mt-3 text-xs font-semibold text-primary">Go to worker dashboard →</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6">
        <BackButton fallback="/jobs" />
      </div>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5 shadow-elevated">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-xs uppercase font-bold text-primary tracking-wide">{jobCategoryName}</p>
            {(job as any).urgency === "urgent" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gold text-gold-foreground inline-flex items-center gap-0.5"><Zap className="size-2.5"/>Urgent</span>}
            {(job as any).urgency === "emergency" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground inline-flex items-center gap-0.5"><AlertTriangle className="size-2.5"/>Emergency</span>}
          </div>
          <h1 className="font-display text-xl font-bold mt-1">{(job as any).title}</h1>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{(job as any).service_area ?? (job as any).city ?? cust?.city ?? "Ghana"}</span>
            {(job as any).budget ? <span className="font-semibold text-primary">Budget GH₵{(job as any).budget}</span> : null}
            {(job as any).preferred_at && <span className="inline-flex items-center gap-1"><Calendar className="size-3"/>{new Date((job as any).preferred_at).toLocaleString()}</span>}
          </div>
          <p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{(job as any).description}</p>
          {jobAddress && <p className="mt-3 text-xs text-muted-foreground">📍 {jobAddress}</p>}
          {isOwner && (job as any).status === "open" && (
            <Link to="/jobs/$id/edit" params={{ id }} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Pencil className="size-3.5"/> Edit this post
            </Link>
          )}
        </div>

        {media.length > 0 && (
          <section className="rounded-2xl bg-card border border-border p-3">
            {media.length === 1 ? (
              <SignedMedia path={media[0].path} type={media[0].type} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {media.map((m: any, i: number) => (
                  <SignedMedia key={i} path={m.path} type={m.type} />
                ))}
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-display font-bold mb-2 text-sm">Location</h3>
          <LocationMap area={(job as any).service_area ?? (job as any).city ?? cust?.city} height={160} />
        </section>

        <section className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
          <div className="size-12 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold">
            {cust?.avatar_url
              ? <img src={cust.avatar_url} className="size-full object-cover"/>
              : (cust?.full_name?.[0] ?? "?")}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{cust?.full_name ?? "Customer"}</p>
            <p className="text-xs text-muted-foreground">Posted {new Date((job as any).created_at).toLocaleDateString()}</p>
          </div>
        </section>

        {isOwner && <ApplicantsPanel jobId={id} jobStatus={(job as any).status} />}

        {role === "worker" && !isOwner && (
          <WorkerApplySection
            jobId={id}
            jobStatus={(job as any).status}
            jobBudget={(job as any).budget}
            jobCategoryName={jobCategoryName}
            isVerified={isVerifiedWorker}
            verificationStatus={workerProfile?.verification_status ?? null}
            categoryMatches={!!categoryMatches}
            myApp={myApp ?? null}
          />
        )}

      </main>
    </div>
  );
}

function WorkerApplySection({
  jobId, jobStatus, jobBudget, jobCategoryName,
  isVerified, verificationStatus, categoryMatches, myApp,
}: {
  jobId: string; jobStatus: string; jobBudget: number | null; jobCategoryName: string;
  isVerified: boolean; verificationStatus: string | null; categoryMatches: boolean;
  myApp: { id: string; status: string; quoted_price: number } | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [start, setStart] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const blockedReason =
    jobStatus !== "open" ? "This job is no longer open."
    : !isVerified ? `Only verified workers can apply. Your account is ${verificationStatus ?? "not verified"}.`
    : !categoryMatches ? `Only verified workers in the ${jobCategoryName} category can apply to this job.`
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid amount (GH₵1 or more).");
    if (!start) return toast.error("Please choose an expected arrival/start time.");
    if (message.trim().length < 3) return toast.error("Please write a short message to the customer.");
    setSubmitting(true);
    const { error } = await supabase.rpc("worker_apply_to_job", {
      _job_id: jobId,
      _proposed_amount: amt,
      _estimated_start: new Date(start).toISOString(),
      _message: message.trim(),
      _note: note.trim() || null,
    } as any);
    setSubmitting(false);
    if (error) {
      console.error("[worker_apply_to_job]", error);
      const msg = error.message || "Could not send application.";
      if (/already applied/i.test(msg)) toast.error("You've already applied to this job.");
      else if (/not in your service category/i.test(msg)) toast.error(`This job is not in your ${jobCategoryName} category.`);
      else if (/verified/i.test(msg)) toast.error("Only approved workers can apply. Please complete verification.");
      else if (/active booking/i.test(msg)) toast.error("You have an active booking. Finish it before applying to new jobs.");
      else if (/own job/i.test(msg)) toast.error("You cannot apply to your own job.");
      else if (/no longer open/i.test(msg)) toast.error("This job is no longer open.");
      else toast.error(msg);
      return;
    }
    toast.success("Application sent!");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["my-application-for-job", jobId] });
    qc.invalidateQueries({ queryKey: ["worker-open-jobs"] });
    qc.invalidateQueries({ queryKey: ["my-applications"] });
  };

  return (
    <section className="rounded-2xl bg-card border border-border p-4 text-sm">
      {myApp ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="size-4"/>
            <p className="font-semibold">Application {myApp.status}</p>
          </div>
          <p className="text-xs text-muted-foreground">Your quote: <b className="text-foreground">GH₵{myApp.quoted_price}</b></p>
          <button type="button" disabled className="w-full h-12 rounded-xl bg-muted text-muted-foreground font-semibold cursor-not-allowed">
            Applied
          </button>
          <Link to="/worker/applications" className="inline-block text-xs font-semibold text-primary">Manage in My Applications →</Link>
        </div>
      ) : blockedReason ? (
        <div className="space-y-2">
          <button type="button" disabled className="w-full h-12 rounded-xl bg-muted text-muted-foreground font-semibold cursor-not-allowed">
            Apply for this Job
          </button>
          <p className="text-xs text-muted-foreground">{blockedReason}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
        >
          Apply for this Job
        </button>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">Customer contact details are shared only after your application is accepted.</p>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => !submitting && setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto"
          >
            <h3 className="font-display text-lg font-bold">Apply for this job</h3>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Proposed amount (GH₵) *</label>
              <input
                type="number" min={1} inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={jobBudget ? `Customer budget: GH₵${jobBudget}` : "e.g. 250"}
                className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Expected arrival / start *</label>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full h-12 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Message to the customer *</label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                placeholder="Tell the customer why you're the right pro."
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{message.length}/1000</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Additional note (optional)</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="Anything else the customer should know."
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={submitting} onClick={() => setOpen(false)} className="flex-1 h-12 rounded-xl border border-border font-semibold">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                {submitting ? "Sending…" : "Submit application"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}


function ApplicantsPanel({ jobId, jobStatus }: { jobId: string; jobStatus: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: apps, isLoading } = useQuery({
    queryKey: ["job-applicants", jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("job_applications")
        .select("id, status, quoted_price, estimated_start, message, created_at, worker_id, profiles!job_applications_worker_id_fkey(full_name, avatar_url), worker_profiles!job_applications_worker_id_fkey(rating, reviews_count, jobs_completed, service_area)")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const accept = async (appId: string) => {
    if (!confirm("Hire this applicant? Other applications will be marked not selected and a booking will be created.")) return;
    setBusyId(appId);
    const { data, error } = await supabase.rpc("customer_accept_job_application", { _application_id: appId });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Worker hired! Booking created.");
    qc.invalidateQueries({ queryKey: ["job-applicants", jobId] });
    qc.invalidateQueries({ queryKey: ["job-request", jobId] });
    if (data) navigate({ to: "/chat/$bookingId", params: { bookingId: data as string } });
  };

  return (
    <section className="rounded-2xl bg-card border border-border p-4 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary"/>
          <p className="font-semibold">Applications received</p>
        </div>
        <span className="text-lg font-bold text-primary">{apps?.length ?? 0}</span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading applicants…</p>
      ) : !apps || apps.length === 0 ? (
        <p className="text-xs text-muted-foreground">No applications yet. Verified workers in this category will see your job on their board.</p>
      ) : apps.map((a: any) => {
        const wp = Array.isArray(a.worker_profiles) ? a.worker_profiles[0] : a.worker_profiles;
        const p = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
        return (
          <div key={a.id} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-start gap-3">
              <div className="size-11 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-sm">
                {p?.avatar_url ? <img src={p.avatar_url} className="size-full object-cover" alt="" /> : (p?.full_name?.[0]?.toUpperCase() ?? <User className="size-4"/>)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link to="/workers/$id" params={{ id: a.worker_id }} className="font-semibold truncate hover:text-primary">
                    {p?.full_name ?? "Worker"}
                  </Link>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    a.status === "accepted" ? "bg-success/20 text-success" :
                    a.status === "rejected" ? "bg-muted text-muted-foreground" :
                    a.status === "withdrawn" ? "bg-muted text-muted-foreground" :
                    "bg-primary-soft text-primary"
                  }`}>{a.status}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {wp?.rating ? `★ ${wp.rating}` : "New"}{wp?.reviews_count ? ` · ${wp.reviews_count} reviews` : ""}
                  {wp?.jobs_completed != null ? ` · ${wp.jobs_completed} jobs` : ""}
                  {wp?.service_area ? ` · ${wp.service_area}` : ""}
                </p>
              </div>
              <span className="font-bold text-primary shrink-0">GH₵{a.quoted_price}</span>
            </div>
            {a.estimated_start && (
              <p className="text-[11px] text-muted-foreground">Can start: {new Date(a.estimated_start).toLocaleString()}</p>
            )}
            {a.message && (
              <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded-lg p-2">{a.message}</p>
            )}
            <div className="flex gap-2 pt-1">
              <Link to="/workers/$id" params={{ id: a.worker_id }} className="flex-1 h-9 rounded-lg border border-border text-xs font-semibold inline-flex items-center justify-center gap-1">
                View profile
              </Link>
              {jobStatus === "open" && a.status === "pending" && (
                <button
                  disabled={busyId === a.id}
                  onClick={() => accept(a.id)}
                  className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                  {busyId === a.id ? "Hiring…" : "Hire this pro"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}


