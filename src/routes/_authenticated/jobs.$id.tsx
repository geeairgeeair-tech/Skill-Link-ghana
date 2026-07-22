import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Zap, AlertTriangle, Calendar, Pencil, CheckCircle2, FileText } from "lucide-react";
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
          <section className="rounded-2xl bg-card border border-border p-4 text-sm">
            {myApp ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-4"/>
                  <p className="font-semibold">Application {myApp.status}</p>
                </div>
                <p className="text-xs text-muted-foreground">Your quote: <b className="text-foreground">GH₵{myApp.quoted_price}</b></p>
                <Link to="/worker/applications" className="inline-block text-xs font-semibold text-primary">Manage in My Applications →</Link>
              </div>
            ) : (job as any).status !== "open" ? (
              <p className="text-xs text-muted-foreground">This job is no longer open.</p>
            ) : !categoryMatches ? (
              <div className="space-y-2">
                <button disabled className="w-full h-12 rounded-xl bg-muted text-muted-foreground font-semibold cursor-not-allowed">
                  Apply for this Job
                </button>
                <p className="text-xs text-muted-foreground">
                  You can view this job, but only verified workers in the <b>{jobCategoryName}</b> category can apply.
                </p>
              </div>
            ) : (
              <Link to="/jobs/$id/apply" params={{ id }} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2">
                Apply for this Job
              </Link>
            )}
            <p className="text-[11px] text-muted-foreground mt-3">Customer contact details are shared only after your application is accepted.</p>
          </section>
        )}
      </main>
    </div>
  );
}

