import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin, Phone, MessageCircle, Calendar, ShieldCheck, Briefcase, Clock } from "lucide-react";
import { toast } from "sonner";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { StarRating } from "@/components/star-rating";
import { useAuth } from "@/hooks/use-auth";
import { LocationMap } from "@/components/location-map";

export const Route = createFileRoute("/workers/$id")({
  head: () => ({
    meta: [
      { title: "Worker Profile — Skill Link Ghana" },
      { name: "description", content: "View verified worker profile, portfolio and reviews on Skill Link Ghana." },
    ],
  }),
  component: WorkerDetail,
});

function WorkerDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const workerQ = useQuery({
    queryKey: ["worker", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_profiles")
        .select("user_id, category_id, bio, years_experience, service_area, city, hourly_rate, callout_fee, starting_price, rating, reviews_count, jobs_completed, is_available, unavailable_note, is_featured, verification_status, created_at, categories(name, slug), profiles!worker_profiles_user_id_fkey(full_name, avatar_url, city, created_at)")
        .eq("user_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const portfolioQ = useQuery({
    queryKey: ["worker-portfolio", id],
    queryFn: async () => (await supabase.from("worker_portfolio").select("*").eq("worker_id", id).order("sort_order").order("created_at", { ascending: false })).data ?? [],
  });

  const reviewsQ = useQuery({
    queryKey: ["reviews", id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("reviews").select("*, profiles!reviews_customer_id_fkey(full_name, avatar_url)").eq("worker_id", id).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const contactQ = useQuery({
    queryKey: ["profile-contact", id, user?.id],
    enabled: !!user && !!id,
    queryFn: async () => (await supabase.rpc("get_profile_contact", { _id: id })).data as any,
  });

  if (workerQ.isLoading) return <ProfileSkeleton />;
  if (workerQ.isError) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-destructive font-semibold">Couldn't load this profile.</p>
        <button onClick={() => workerQ.refetch()} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">Retry</button>
      </div>
    );
  }
  const w: any = workerQ.data;
  if (!w) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="font-semibold">Worker not found.</p>
        <p className="text-sm text-muted-foreground">This profile may not be verified yet, or the link is broken.</p>
        <Link to="/workers" className="inline-block text-primary font-semibold">Back to browse</Link>
      </div>
    );
  }

  const p: any = w.profiles ?? {};
  const phone: string | undefined = (contactQ.data as any)?.[0]?.phone;
  const available = w.is_available ?? true;
  const memberSince = p.created_at ? new Date(p.created_at) : null;
  const isVerified = w.verification_status === "approved";

  const onBook = () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    toast.info("Booking is coming next — this feature is being built.");
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-20 rounded-b-3xl">
        <BackButton fallback="/workers" className="text-primary-foreground/90 hover:text-primary-foreground" />
      </div>

      <div className="mx-auto max-w-md px-5 -mt-16">
        <header className="rounded-2xl bg-card border border-border shadow-elevated p-5">
          <div className="flex gap-4">
            <div className="size-24 rounded-2xl bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-3xl shrink-0">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.full_name ?? "Worker"} className="size-full object-cover" />
              ) : (
                (p.full_name?.[0] ?? "?").toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <h1 className="font-display text-xl font-bold truncate">{p.full_name ?? "Pro"}</h1>
                {isVerified && <BadgeCheck className="size-5 text-primary fill-primary-soft" />}
                {w.is_featured && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-gold/20 text-gold-foreground px-1.5 py-0.5 rounded">Featured</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{w.categories?.name ?? "Pro"}</p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${available ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  <span className={`size-1.5 rounded-full ${available ? "bg-success" : "bg-muted-foreground"}`} />
                  {available ? "Available now" : "Unavailable"}
                </span>
                {isVerified && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    <ShieldCheck className="size-3" /> Verified
                  </span>
                )}
              </div>
              {!available && w.unavailable_note && (
                <p className="text-xs text-muted-foreground mt-1 italic">"{w.unavailable_note}"</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <StarRating value={Number(w.rating ?? 0)} count={w.reviews_count ?? 0} />
                <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{w.service_area ?? w.city ?? "Ghana"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-5 text-center">
            <Stat icon={<Clock className="size-3.5" />} label="Experience" value={`${w.years_experience ?? 0}y`} />
            <Stat icon={<Briefcase className="size-3.5" />} label="Jobs done" value={String(w.jobs_completed ?? 0)} />
            <Stat label="From" value={`GH₵${w.starting_price ?? 0}`} />
          </div>

          {memberSince && (
            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              Member since {memberSince.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </p>
          )}
        </header>

        <Section title="About">
          {w.bio ? (
            <p className="text-sm leading-relaxed whitespace-pre-line">{w.bio}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">This pro hasn't added a bio yet.</p>
          )}
        </Section>

        <Section title="Services">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary-soft text-primary px-2.5 py-1.5 rounded-lg">
              {w.categories?.name ?? "General services"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
            <PriceRow label="Call-out fee" value={`GH₵${w.callout_fee ?? 0}`} />
            <PriceRow label="Hourly rate" value={`GH₵${w.hourly_rate ?? 0}/hr`} />
          </div>
        </Section>

        <Section title="Service area">
          <LocationMap area={w.service_area ?? p.city} height={180} />
          <p className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="size-3" /> {w.service_area ?? "Ghana"}</p>
        </Section>

        <Section title={`Portfolio${portfolioQ.data && portfolioQ.data.length > 0 ? ` (${portfolioQ.data.length})` : ""}`}>
          {portfolioQ.isLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : portfolioQ.data && portfolioQ.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {portfolioQ.data.map((it: any) => (
                <div key={it.id} className="rounded-xl overflow-hidden border border-border bg-muted">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.title ?? "Portfolio item"} className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="aspect-square w-full grid place-items-center text-xs text-muted-foreground">No image</div>
                  )}
                  {it.title && <p className="text-xs font-semibold px-2 py-1.5 truncate">{it.title}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No portfolio items yet.</p>
          )}
        </Section>

        <Section title={`Reviews${reviewsQ.data && reviewsQ.data.length > 0 ? ` (${reviewsQ.data.length})` : ""}`}>
          {!user ? (
            <p className="text-sm text-muted-foreground">
              <Link to="/auth" className="text-primary font-semibold">Sign in</Link> to read reviews from other customers.
            </p>
          ) : reviewsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : reviewsQ.data && reviewsQ.data.length > 0 ? (
            <div className="space-y-3">
              {reviewsQ.data.map((r: any) => (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{r.profiles?.full_name ?? "Customer"}</p>
                    <StarRating value={r.rating} />
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground mt-1">{r.comment}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No reviews yet — be the first to hire and review this pro.</p>
          )}
        </Section>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border p-3 z-40">
        <div className="mx-auto max-w-md flex gap-2">
          {phone && (
            <a href={`tel:${phone}`} aria-label="Call" className="size-12 grid place-items-center rounded-xl border border-input"><Phone className="size-4" /></a>
          )}
          <button aria-label="Message" className="size-12 grid place-items-center rounded-xl border border-input" onClick={() => toast.info("Messaging is coming soon.")}>
            <MessageCircle className="size-4" />
          </button>
          <button
            onClick={onBook}
            className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 h-12"
          >
            <Calendar className="size-4" /> Book This Professional
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted p-2">
      <p className="font-bold inline-flex items-center gap-1 justify-center">{icon}{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl bg-card border border-border p-5 shadow-card">
      <h3 className="font-display font-bold mb-3">{title}</h3>
      {children}
    </section>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold text-primary">{value}</p>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="fg-gradient-hero px-5 pt-5 pb-20 rounded-b-3xl h-32" />
      <div className="mx-auto max-w-md px-5 -mt-16">
        <div className="rounded-2xl bg-card border border-border p-5 animate-pulse">
          <div className="flex gap-4">
            <div className="size-24 rounded-2xl bg-muted" />
            <div className="flex-1 space-y-2 py-2">
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted" />)}
          </div>
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="mt-5 h-32 rounded-2xl bg-card border border-border animate-pulse" />
        ))}
      </div>
    </div>
  );
}
