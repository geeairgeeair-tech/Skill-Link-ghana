import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, MessageCircle, Zap, AlertTriangle, Calendar, Pencil } from "lucide-react";
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
  const { data: custContact } = useQuery({
    queryKey: ["profile-contact", (job as any)?.customer_id, user?.id],
    enabled: !!user && !!job && role === "worker" && user.id !== (job as any).customer_id,
    queryFn: async () => (await supabase.rpc("get_profile_contact", { _id: (job as any).customer_id })).data as any,
  });

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!job) return <div className="p-8 text-center"><p>Job not found.</p><Link to="/jobs" className="text-primary font-semibold">Back to board</Link></div>;

  const media: any[] = Array.isArray((job as any).media) ? (job as any).media : [];
  const cust = (job as any).profiles;
  const phone = (custContact as any)?.[0]?.phone ?? null;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6">
        <BackButton fallback="/jobs" />
      </div>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5 shadow-elevated">
          <p className="text-xs uppercase font-bold text-primary tracking-wide">{(job as any).categories?.name ?? "Job"}</p>
          <h1 className="font-display text-xl font-bold mt-1">{(job as any).title}</h1>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{(job as any).city ?? cust?.city ?? "Ghana"}</span>
            {(job as any).budget ? <span className="font-semibold text-primary">Budget GH₵{(job as any).budget}</span> : null}
          </div>
          <p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{(job as any).description}</p>
          {jobAddress && <p className="mt-3 text-xs text-muted-foreground">📍 {jobAddress}</p>}
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
          <LocationMap area={(job as any).city ?? cust?.city} height={160} />
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

        {role === "worker" && phone && user?.id !== (job as any).customer_id && (
          <div className="rounded-2xl bg-primary-soft border border-primary/20 p-3 text-sm">
            <p className="font-semibold text-primary mb-2">Interested? Call the customer directly.</p>
            <div className="flex gap-2">
              <a href={`tel:${phone}`} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2">
                <Phone className="size-4"/> Call {phone}
              </a>
              <a href={`https://wa.me/${phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="size-11 grid place-items-center rounded-xl bg-success text-success-foreground">
                <MessageCircle className="size-4"/>
              </a>
            </div>
          </div>
        )}
        {role === "worker" && !phone && (
          <p className="text-xs text-muted-foreground text-center">No phone number on file — customer can be reached after booking.</p>
        )}
      </main>
    </div>
  );
}
