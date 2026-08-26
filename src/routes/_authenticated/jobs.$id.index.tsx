import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { isJobEditable } from "@/lib/job-editable";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Zap, AlertTriangle, Calendar, Pencil, CheckCircle2, FileText, User, Clock } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { ReviewAndConfirmModal, DeclineApplicationModal } from "@/components/application-decision-modals";
import { jobTimingLabel, jobDurationLabel } from "@/lib/job-timing";
import { useAuth } from "@/hooks/use-auth";
import { useWorkerEligibility } from "@/hooks/use-job-eligibility";
import { SignedImage } from "./jobs.index";
import { LocationMap } from "@/components/location-map";

export const Route = createFileRoute("/_authenticated/jobs/$id/")({
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

function JobDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fg-gradient-hero px-5 pt-5 pb-10" />
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
        ))}
      </main>
    </div>
  );
}

function JobDetail() {
  const { id } = Route.useParams();
  const { user, role } = useAuth();
  const eligibility = useWorkerEligibility();
  const { data: job, isLoading, isError, refetch } = useQuery({
    queryKey: ["job-request", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_requests")
      // Exact location columns (address/lat/lng/landmark/instructions) are not
      // readable here — the owner/admin/assigned pro reads them via RPC.
      .select("id, title, description, budget, city, service_area, service_area_id, status, urgency, preferred_at, timing_type, preferred_window, duration_type, duration_start_date, duration_end_date, media, created_at, customer_id, category_id, booking_id, categories(name), service_areas(name), profiles!job_requests_customer_id_fkey(full_name, city, avatar_url)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const jobBookingId = (job as any)?.booking_id as string | null | undefined;
  const { data: jobBookingStatus } = useQuery({
    queryKey: ["job-booking-status", jobBookingId],
    enabled: !!jobBookingId,
    queryFn: async () =>
      ((await supabase.from("bookings").select("status").eq("id", jobBookingId!).maybeSingle()).data as any)
        ?.status as string | null,
  });
  const { data: jobAddress } = useQuery({
    queryKey: ["job-request-address", id, user?.id],
    enabled: !!user && !!job && (job as any).customer_id === user.id,
    queryFn: async () => (await supabase.rpc("get_job_request_address", { _id: id })).data as string | null,
  });

  // Worker verification status + category (gates Apply)
  const { data: workerProfile } = useQuery({
    queryKey: ["worker-profile-self", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("worker_profiles")
      .select("verification_status, category_id, categories(name)").eq("user_id", user!.id).maybeSingle()).data,
  });

  // Existing application by this worker for this job
  const { data: myApp } = useQuery({
    queryKey: ["my-application-for-job", id, user?.id],
    enabled: !!user,
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

  if (isLoading) return <JobDetailSkeleton />;
  if (isError) return (
    <div className="p-8 text-center space-y-3">
      <p className="font-semibold text-destructive">Couldn't load this job.</p>
      <button onClick={() => refetch()} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold">Retry</button>
    </div>
  );
  if (!job) return <div className="p-8 text-center"><p>Job not found.</p><Link to="/jobs" className="text-primary font-semibold">Back to board</Link></div>;

  const media: any[] = Array.isArray((job as any).media) ? (job as any).media : [];
  const cust = (job as any).profiles;
  const isVerifiedWorker = workerProfile?.verification_status === "approved";
  const isPendingOrRejected = !!workerProfile && workerProfile.verification_status !== "approved";
  const isOwner = user?.id === (job as any).customer_id;
  const jobCategoryName = (job as any).categories?.name ?? "this category";

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
              <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{(job as any).service_areas?.name ?? (job as any).service_area ?? (job as any).city ?? "Ghana"}</span>
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
            <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{(job as any).service_areas?.name ?? (job as any).service_area ?? (job as any).city ?? cust?.city ?? "Ghana"}</span>
            {(job as any).budget ? <span className="font-semibold text-primary">Budget GH₵{(job as any).budget}</span> : null}
            {(() => { const t = jobTimingLabel(job as any); return t.asap
              ? <span className="inline-flex items-center gap-1 font-semibold text-primary">⚡ ASAP</span>
              : <span className="inline-flex items-center gap-1"><Calendar className="size-3"/>{t.text}</span>; })()}
            {(() => { const d = jobDurationLabel(job as any); return d ? <span className="inline-flex items-center gap-1 font-semibold text-foreground">{d.text}</span> : null; })()}
          </div>
          <p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{(job as any).description}</p>
          {jobAddress && <p className="mt-3 text-xs text-muted-foreground">📍 {jobAddress}</p>}
          {isOwner && isJobEditable((job as any).status, jobBookingStatus) && (
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
          <LocationMap area={(job as any).service_areas?.name ?? (job as any).service_area ?? (job as any).city ?? cust?.city} height={160} />
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

        {eligibility.isWorker && !isOwner && (
          <WorkerApplySection
            jobId={id}
            jobStatus={(job as any).status}
            jobBudget={(job as any).budget}
            jobCategoryName={jobCategoryName}
            blockedReason={eligibility.blockedReason(
              (job as any).status,
              (job as any).category_id ?? null,
              jobCategoryName,
              (job as any).service_area_id ?? null,
              (job as any).service_areas?.name ?? null,
            )}
            myApp={myApp ?? null}
          />
        )}

      </main>
    </div>
  );
}

function WorkerApplySection({
  jobId, jobStatus, jobBudget, jobCategoryName, blockedReason, myApp,
}: {
  jobId: string; jobStatus: string; jobBudget: number | null; jobCategoryName: string;
  blockedReason: string | null;
  myApp: { id: string; status: string; quoted_price: number } | null;
}) {
  void jobBudget; void jobCategoryName;


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
        <Link
          to="/jobs/$id/apply"
          params={{ id: jobId }}
          className="flex items-center justify-center w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
        >
          Apply for this Job
        </Link>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">Customer contact details are shared only after your application is accepted.</p>

    </section>
  );
}


function ApplicantsPanel({ jobId, jobStatus }: { jobId: string; jobStatus: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reviewFor, setReviewFor] = useState<any | null>(null);
  const [declineFor, setDeclineFor] = useState<any | null>(null);

  const { data: apps, isLoading, error: appsError, refetch: refetchApps } = useQuery({
    queryKey: ["job-applicants", jobId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("job_applications")
        .select("id, status, quoted_price, estimated_start, message, created_at, decline_reason, declined_at, worker_id")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (error) { console.error("[job-applicants]", error); throw error; }
      const list = rows ?? [];
      if (list.length === 0) return [];
      const ids = Array.from(new Set(list.map((r: any) => r.worker_id)));
      const [{ data: profs }, { data: wps }, { data: bks }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids),
        supabase.from("worker_profiles").select("user_id, rating, reviews_count, jobs_completed, service_area, verification_status, categories(name)").in("user_id", ids),
        supabase.from("bookings").select("id, job_application_id").in("job_application_id", list.map((r: any) => r.id)),
      ]);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const wMap = new Map((wps ?? []).map((w: any) => [w.user_id, w]));
      const bMap = new Map((bks ?? []).map((b: any) => [b.job_application_id, b.id]));
      return list.map((a: any) => ({ ...a, profile: pMap.get(a.worker_id) ?? null, worker: wMap.get(a.worker_id) ?? null, booking_id: bMap.get(a.id) ?? null }));
    },
  });

  return (
    <section id="applicants" className="scroll-mt-4 rounded-2xl bg-card border border-border p-4 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary"/>
          <p className="font-semibold">Applications received</p>
        </div>
        <span className="text-lg font-bold text-primary">{apps?.length ?? 0}</span>
      </div>

      {isLoading ? (
        Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)
      ) : appsError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-xs font-semibold text-destructive">Couldn't load applicants.</p>
          <button onClick={() => refetchApps()} className="mt-2 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold">Retry</button>
        </div>
      ) : !apps || apps.length === 0 ? (
        <p className="text-xs text-muted-foreground">No applications yet. Verified workers in this category will see your job on their board.</p>
      ) : apps.map((a: any) => {
        const wp = a.worker;
        const p = a.profile;
        const cat = wp?.categories?.name;
        return (
          <div key={a.id} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-start gap-3">
              <div className="size-11 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-sm">
                {p?.avatar_url ? <img src={p.avatar_url} className="size-full object-cover" alt="" /> : (p?.full_name?.[0]?.toUpperCase() ?? <User className="size-4"/>)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to="/workers/$id" params={{ id: a.worker_id }} search={{ jobId, applicationId: a.id }} className="font-semibold truncate hover:text-primary">
                    {p?.full_name ?? "Worker"}
                  </Link>
                  {wp?.verification_status === "approved" && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-success/20 text-success inline-flex items-center gap-0.5">
                      <CheckCircle2 className="size-2.5"/> Verified
                    </span>
                  )}
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    a.status === "accepted" ? "bg-success/20 text-success" :
                    a.status === "rejected" ? "bg-muted text-muted-foreground" :
                    a.status === "withdrawn" ? "bg-muted text-muted-foreground" :
                    "bg-primary-soft text-primary"
                  }`}>{a.status === "rejected" ? "not selected" : a.status}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {cat ? cat : "Worker"}
                  {wp?.rating ? ` · ★ ${wp.rating}` : " · New"}{wp?.reviews_count ? ` (${wp.reviews_count})` : ""}
                  {wp?.jobs_completed != null ? ` · ${wp.jobs_completed} jobs` : ""}
                  {wp?.service_area ? ` · ${wp.service_area}` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Applied {new Date(a.created_at).toLocaleString()}</p>
              </div>
              <span className="font-bold text-primary shrink-0">GH₵{a.quoted_price}</span>
            </div>
            {a.estimated_start && (
              <p className="text-[11px] text-muted-foreground">Can start: {new Date(a.estimated_start).toLocaleString()}</p>
            )}
            {a.message && (
              <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded-lg p-2">{a.message}</p>
            )}
            {a.status === "rejected" && a.decline_reason && (
              <p className="text-[11px] text-muted-foreground italic">Declined: "{a.decline_reason}"</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to="/workers/$id" params={{ id: a.worker_id }} search={{ jobId, applicationId: a.id }} className="flex-1 h-9 rounded-lg border border-border text-xs font-semibold inline-flex items-center justify-center gap-1">
                View profile
              </Link>
              {jobStatus === "open" && a.status === "pending" && (
                <>
                  <button
                    onClick={() => setReviewFor(a)}
                    className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                    Accept
                  </button>
                  <button
                    onClick={() => setDeclineFor(a)}
                    className="flex-1 h-9 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold">
                    Decline
                  </button>
                </>
              )}
              {a.status === "accepted" && (
                a.booking_id ? (
                  <Link to="/bookings/$bookingId" params={{ bookingId: a.booking_id }} className="flex-1 h-9 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center justify-center">
                    Open Booking →
                  </Link>
                ) : (
                  <Link to="/bookings" className="flex-1 h-9 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center justify-center">
                    Open Booking →
                  </Link>
                )
              )}
            </div>
          </div>
        );
      })}

      {reviewFor && (
        <ReviewAndConfirmModal
          app={reviewFor}
          onClose={() => setReviewFor(null)}
          onDone={(bookingId) => {
            setReviewFor(null);
            qc.invalidateQueries({ queryKey: ["job-applicants", jobId] });
            qc.invalidateQueries({ queryKey: ["job-request", jobId] });
            qc.invalidateQueries({ queryKey: ["my-bookings"] });
            qc.invalidateQueries({ queryKey: ["job-applicant-counts"] });
            qc.invalidateQueries({ queryKey: ["my-job-posts-summary"] });
            if (bookingId) navigate({ to: "/bookings/$bookingId", params: { bookingId } });
          }}
        />
      )}
      {declineFor && (
        <DeclineApplicationModal
          app={declineFor}
          onClose={() => setDeclineFor(null)}
          onDone={() => {
            setDeclineFor(null);
            qc.invalidateQueries({ queryKey: ["job-applicants", jobId] });
            qc.invalidateQueries({ queryKey: ["job-applicant-counts"] });
            qc.invalidateQueries({ queryKey: ["my-job-posts-summary"] });
          }}
        />
      )}
    </section>
  );
}




