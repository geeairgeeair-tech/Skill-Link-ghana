import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin, Phone, MessageCircle, Calendar, Briefcase, Clock } from "lucide-react";
import { toast } from "sonner";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { StarRating } from "@/components/star-rating";
import { VerificationBadge } from "@/components/verification-badge";
import { EquipmentBadge } from "@/components/equipment-badge";
import { signMedia, toMediaRefs } from "@/lib/media";
import { useAuth } from "@/hooks/use-auth";
import { LocationMap } from "@/components/location-map";
import { GuestGate } from "@/components/guest-gate";
import { useQueryClient } from "@tanstack/react-query";
import { ReviewAndConfirmModal, DeclineApplicationModal } from "@/components/application-decision-modals";



export const Route = createFileRoute("/workers/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    jobId: typeof search.jobId === "string" ? search.jobId : undefined,
    applicationId: typeof search.applicationId === "string" ? search.applicationId : undefined,
  }),
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
  const { jobId, applicationId } = Route.useSearch();
  const qc = useQueryClient();
  const [decisionOpen, setDecisionOpen] = useState<"accept" | "decline" | null>(null);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [activeProfId, setActiveProfId] = useState<string | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);



  const workerQ = useQuery({
    queryKey: ["worker", id],
    enabled: !!user,
    queryFn: async () => {
      const { data: wp, error } = await supabase
        .from("worker_profiles")
        .select("user_id, category_id, bio, years_experience, service_area, city, hourly_rate, callout_fee, starting_price, rating, reviews_count, jobs_completed, is_available, unavailable_note, is_featured, verification_status, created_at, categories(name, slug)")
        .eq("user_id", id)
        .eq("verification_status", "approved")
        .maybeSingle();
      if (error) throw error;
      if (!wp) return null;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, city, created_at")
        .eq("id", id)
        .maybeSingle();
      return { ...wp, profiles: prof ?? {} };
    },
  });

  // Non-sensitive coverage summary only — no addresses, no coordinates.
  const coverageQ = useQuery({
    queryKey: ["worker-coverage", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_service_areas")
        .select("is_primary, service_areas(name, launch_zone, sort_order)")
        .eq("worker_id", id);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        primary: rows.find((r) => r.is_primary)?.service_areas?.name ?? null,
        others: rows
          .filter((r) => !r.is_primary && r.service_areas)
          .map((r) => r.service_areas.name)
          .sort((a: string, b: string) => a.localeCompare(b)),
      };
    },
  });

  const professionsQ = useQuery({
    queryKey: ["worker-professions", id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase
        .from("worker_professions")
        .select("id, bio, years_experience, service_description, starting_price, callout_fee, daily_rate, strengths, portfolio_images, equipment_status, is_primary, category_id, categories(name)")
        .eq("user_id", id)
        .eq("verification_status", "approved")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
      ).data ?? [],
  });



  const portfolioQ = useQuery({
    queryKey: ["worker-portfolio", id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("worker_portfolio").select("*").eq("worker_id", id).order("sort_order").order("created_at", { ascending: false })).data ?? [],
  });


  const reviewsQ = useQuery({
    queryKey: ["reviews", id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, would_hire_again, booking_id, customer_id")
        .eq("worker_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];
      const custIds = Array.from(new Set(list.map((r: any) => r.customer_id)));
      const bookingIds = Array.from(new Set(list.map((r: any) => r.booking_id).filter(Boolean)));
      const [{ data: profs }, bksRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", custIds),
        bookingIds.length
          ? supabase.from("bookings").select("id, status").in("id", bookingIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const bks = (bksRes as any)?.data ?? [];
      const pMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
      const bMap = new Map<string, any>((bks as any[]).map((b: any) => [b.id, b]));
      return list.map((r: any) => ({
        ...r,
        customer: pMap.get(r.customer_id) ?? null,
        verified: (bMap.get(r.booking_id) as any)?.status === "completed",
      }));
    },
  });

  const contactQ = useQuery({
    queryKey: ["profile-contact", id, user?.id],
    enabled: !!user && !!id,
    queryFn: async () => (await supabase.rpc("get_profile_contact", { _id: id })).data as any,
  });

  const statusQ = useQuery({
    queryKey: ["worker-status", id],
    enabled: !!user,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_worker_public_status", { _worker_id: id });
      return (data as string | null) ?? "available";
    },
  });


  if (authLoading) return <ProfileSkeleton />;
  if (!user) return <GuestGate />;
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
  const professions: any[] = professionsQ.data ?? [];
  const activeProf: any =
    professions.find((pr: any) => pr.id === activeProfId) ??
    professions.find((pr: any) => pr.is_primary) ??
    professions[0] ??
    null;

  const phone: string | undefined = (contactQ.data as any)?.[0]?.phone;
  const state = (statusQ.data ?? ((w.is_available ?? true) ? "available" : "unavailable")) as
    | "available"
    | "busy"
    | "unavailable";
  const available = state === "available";
  const statusLabel = state === "available" ? "Available now" : state === "busy" ? "Currently busy" : "Unavailable";
  const blockedMessage =
    state === "busy"
      ? "This worker is currently working on another booking."
      : "This worker is currently unavailable. Please choose another professional or check again later.";
  const memberSince = p.created_at ? new Date(p.created_at) : null;

  const isSelf = !!user && user.id === id;

  // Application context: only the owner of that job may act on the application.
  const appCtxQ = useQuery({
    queryKey: ["profile-app-context", applicationId, user?.id],
    enabled: !!user && !!applicationId && !!jobId,
    queryFn: async () => {
      const { data: app } = await supabase
        .from("job_applications")
        .select("id, job_id, worker_id, status, quoted_price, estimated_start, message")
        .eq("id", applicationId!)
        .maybeSingle();
      if (!app || app.job_id !== jobId || app.worker_id !== id) return null;
      const { data: job } = await supabase
        .from("job_requests")
        .select("id, customer_id, status")
        .eq("id", jobId!)
        .maybeSingle();
      if (!job || job.customer_id !== user!.id) return null;
      const { data: bk } = await supabase
        .from("bookings")
        .select("id")
        .eq("job_application_id", app.id)
        .maybeSingle();
      return { app, jobStatus: String(job.status), bookingId: bk?.id ?? null };
    },
  });
  const appCtx = appCtxQ.data ?? null;

  const onBook = () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (isSelf) {
      toast.error("You can't book yourself.");
      return;
    }
    if (!available) {
      toast.error(blockedMessage);
      return;
    }
    navigate({ to: "/book/$workerId", params: { workerId: id } });
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
                <VerificationBadge status={w.verification_status} />

                {w.is_featured && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-gold/20 text-gold-foreground px-1.5 py-0.5 rounded">Featured</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{w.categories?.name ?? "Pro"}</p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${state === "available" ? "bg-success/15 text-success" : state === "busy" ? "bg-gold/20 text-gold-foreground" : "bg-muted text-muted-foreground"}`}>
                  <span className={`size-1.5 rounded-full ${state === "available" ? "bg-success" : state === "busy" ? "bg-gold" : "bg-muted-foreground"}`} />
                  {statusLabel}
                </span>
              </div>
              {!available && w.unavailable_note && (
                <p className="text-xs text-muted-foreground mt-1 italic">"{w.unavailable_note}"</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <StarRating value={Number(w.rating ?? 0)} count={w.reviews_count ?? 0} />
                <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{coverageQ.data?.primary ?? w.service_area ?? w.city ?? "Ghana"}</span>
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

        {professions.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {professions.map((pr: any) => {
              const active = pr.id === activeProf?.id;
              return (
                <button
                  key={pr.id}
                  onClick={() => setActiveProfId(pr.id)}
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"}`}
                >
                  <BadgeCheck className="size-3" />
                  {pr.categories?.name ?? "Service"}
                  {pr.is_primary && <span className="text-[10px] opacity-70">Primary</span>}
                </button>
              );
            })}
          </div>
        )}

        {activeProf ? (
          <>
            <Section title={activeProf.categories?.name ?? "Service"}>
              {/* Account-level verification badge lives in the header only — professions show equipment status. */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <EquipmentBadge status={activeProf.equipment_status} />
              </div>

              {activeProf.bio ? (
                <p className="text-sm leading-relaxed whitespace-pre-line">{activeProf.bio}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No bio added for this profession yet.</p>
              )}
              {activeProf.service_description && (
                <p className="text-sm text-muted-foreground whitespace-pre-line mt-2">{activeProf.service_description}</p>
              )}

              {(activeProf.strengths ?? []).length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Professional strengths</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeProf.strengths as string[]).map((s) => (
                      <span key={s} className="text-[11px] font-semibold bg-primary-soft text-primary px-2.5 py-1 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <PriceRow label="Starting price" value={`GH₵${activeProf.starting_price ?? 0}`} />
                <PriceRow label="Call-out fee" value={`GH₵${activeProf.callout_fee ?? 0}`} />
                <PriceRow label="Daily rate" value={`GH₵${activeProf.daily_rate ?? 0}`} />
                <PriceRow label="Experience" value={`${activeProf.years_experience ?? w.years_experience ?? 0}y`} />
              </div>
            </Section>

            <ProfessionPortfolio profession={activeProf} />
          </>
        ) : (
          <Section title="About">
            {w.bio ? (
              <p className="text-sm leading-relaxed whitespace-pre-line">{w.bio}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">This pro hasn't added a bio yet.</p>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <PriceRow label="Starting price" value={`GH₵${w.starting_price ?? 0}`} />
              <PriceRow label="Call-out fee" value={`GH₵${w.callout_fee ?? 0}`} />
            </div>
          </Section>
        )}

        {coverageQ.data?.primary && (
          <Section title="General service areas">
            <p className="text-sm font-semibold inline-flex items-center gap-1">
              <MapPin className="size-4 text-primary" /> Primary service area: {coverageQ.data.primary}
            </p>
            {coverageQ.data.others.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Also serves: {coverageQ.data.others.join(", ")}
              </p>
            )}
          </Section>
        )}

        <Section title="Service area">
          <LocationMap area={w.service_area ?? p.city} height={180} />
          <p className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="size-3" /> {w.service_area ?? "Ghana"}</p>
        </Section>

        {portfolioQ.data && portfolioQ.data.length > 0 && (
          <Section title={`More work (${portfolioQ.data.length})`}>
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
          </Section>
        )}


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
              {(showAllReviews ? reviewsQ.data : reviewsQ.data.slice(0, 3)).map((r: any) => (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-xs">
                        {r.customer?.avatar_url
                          ? <img src={r.customer.avatar_url} alt="" className="size-full object-cover"/>
                          : (r.customer?.full_name?.[0]?.toUpperCase() ?? "?")}
                      </div>
                      <p className="font-semibold text-sm truncate">{r.customer?.full_name ?? "Customer"}</p>
                    </div>
                    <StarRating value={r.rating} />
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground mt-1">{r.comment}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span>
                    {r.verified && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-success/15 text-success inline-flex items-center gap-0.5">
                        <BadgeCheck className="size-2.5"/> Verified Booking
                      </span>
                    )}
                    {r.would_hire_again === true && (
                      <span className="text-[10px] font-semibold text-primary">Would hire again</span>
                    )}
                  </div>
                </div>
              ))}
              {reviewsQ.data.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllReviews((v) => !v)}
                  className="w-full rounded-xl border border-border py-2 text-sm font-semibold text-primary"
                >
                  {showAllReviews ? "Show less" : `See all ${reviewsQ.data.length} reviews`}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No reviews yet — be the first to hire and review this pro.</p>
          )}

        </Section>
      </div>

      {isSelf ? (
        <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border p-3 z-40">
          <div className="mx-auto max-w-md text-center text-xs text-muted-foreground">
            This is your public profile — customers see it exactly like this.
          </div>
        </div>
      ) : appCtx ? (
        <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border p-3 z-40">
          <div className="mx-auto max-w-md space-y-2">
            <p className="text-xs text-center text-muted-foreground">
              This professional applied to your job — quoted GH₵{appCtx.app.quoted_price}.
            </p>
            {appCtx.app.status === "pending" && appCtx.jobStatus === "open" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setDecisionOpen("decline")}
                  className="flex-1 h-12 rounded-xl border border-destructive/40 text-destructive font-semibold"
                >
                  Decline Application
                </button>
                <button
                  onClick={() => setDecisionOpen("accept")}
                  className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
                >
                  Accept Application
                </button>
              </div>
            ) : appCtx.app.status === "accepted" ? (
              appCtx.bookingId ? (
                <Link
                  to="/bookings/$bookingId"
                  params={{ bookingId: appCtx.bookingId }}
                  className="flex h-12 rounded-xl bg-success text-success-foreground font-semibold items-center justify-center"
                >
                  Hired — Open Booking →
                </Link>
              ) : (
                <Link to="/bookings" className="flex h-12 rounded-xl bg-success text-success-foreground font-semibold items-center justify-center">
                  Hired — Open Booking →
                </Link>
              )
            ) : (
              <p className="text-sm text-center font-semibold">
                {appCtx.app.status === "withdrawn"
                  ? "This application was withdrawn."
                  : appCtx.app.status === "rejected"
                    ? "This application was declined."
                    : "This job is no longer open for applications."}
              </p>
            )}
          </div>
        </div>
      ) : (
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border p-3 z-40">
        <div className="mx-auto max-w-md space-y-2">
          {!available && (
            <p className="text-xs text-center text-muted-foreground">{blockedMessage}</p>
          )}
          <div className="flex gap-2">
            {phone && (
              <a href={`tel:${phone}`} aria-label="Call" className="size-12 grid place-items-center rounded-xl border border-input"><Phone className="size-4" /></a>
            )}
            <button aria-label="Message" className="size-12 grid place-items-center rounded-xl border border-input" onClick={() => toast.info("Messaging becomes available after you book this professional.")}>
              <MessageCircle className="size-4" />
            </button>
            <button
              onClick={onBook}
              disabled={!available}
              className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Calendar className="size-4" />
              {state === "busy" ? "Currently busy" : state === "unavailable" ? "Unavailable" : "Book This Professional"}
            </button>
          </div>
        </div>
      </div>
      )}

      {appCtx && decisionOpen === "accept" && (
        <ReviewAndConfirmModal
          app={{ ...appCtx.app, profile: p, worker: w }}
          onClose={() => setDecisionOpen(null)}
          onDone={(bookingId) => {
            setDecisionOpen(null);
            qc.invalidateQueries({ queryKey: ["profile-app-context"] });
            qc.invalidateQueries({ queryKey: ["job-applicants"] });
            if (bookingId) navigate({ to: "/bookings/$bookingId", params: { bookingId } });
          }}
        />
      )}
      {appCtx && decisionOpen === "decline" && (
        <DeclineApplicationModal
          app={appCtx.app}
          onClose={() => setDecisionOpen(null)}
          onDone={() => {
            setDecisionOpen(null);
            qc.invalidateQueries({ queryKey: ["profile-app-context"] });
            qc.invalidateQueries({ queryKey: ["job-applicants"] });
          }}
        />
      )}



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

function ProfessionPortfolio({ profession }: { profession: any }) {
  const [shots, setShots] = useState<{ path: string; url: string }[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const refs = toMediaRefs(profession?.portfolio_images);
      if (refs.length === 0) { setShots([]); return; }
      const signed = await signMedia(refs);
      if (alive) setShots(signed.map((s) => ({ path: s.path, url: s.url })));
    })();
    return () => { alive = false; };
  }, [profession?.id]);

  if (shots.length === 0) return null;
  return (
    <Section title={`${profession?.categories?.name ?? "Service"} portfolio (${shots.length})`}>
      <div className="grid grid-cols-2 gap-2">
        {shots.map((s) => (
          <img key={s.path} src={s.url} alt="Portfolio work" loading="lazy"
            className="aspect-square w-full object-cover rounded-xl border border-border" />
        ))}
      </div>
    </Section>
  );
}
