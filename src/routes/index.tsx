import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Search, ShieldCheck, Sparkles, ArrowRight, Camera, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { FeaturedCategoryGrid } from "@/components/customer-marketplace";
import { WorkerCard, type WorkerCardData } from "@/components/worker-card";
import { useAppRole } from "@/hooks/use-app-role";
import { useBusyWorkerIds, withAvailabilityState } from "@/hooks/use-busy-workers";
import { useMyJobPostsSummary } from "@/hooks/use-job-applicant-counts";
import { BrandLogo } from "@/components/brand-logo";
import { GuestGateCard } from "@/components/guest-gate";



const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("categories").select("*").eq("active", true).order("sort_order");
    if (error) throw error;
    return data;
  },
});

const featuredQuery = queryOptions({
  queryKey: ["workers", "featured"],
  queryFn: async (): Promise<WorkerCardData[]> => {
    const { data, error } = await supabase
      .from("worker_profiles")
      .select("user_id, city, service_area, rating, reviews_count, starting_price, is_featured, jobs_completed, is_available, years_experience, categories(name)")
      .eq("verification_status", "approved")
      .order("is_featured", { ascending: false })
      .order("rating", { ascending: false })
      .limit(6);
    if (error) return [];
    const rows = data ?? [];
    const ids = rows.map((w: any) => w.user_id);
    const profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
      (profs ?? []).forEach((p: any) => profilesMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url }));
    }
    return rows.map((w: any) => ({
      user_id: w.user_id,
      full_name: profilesMap.get(w.user_id)?.full_name ?? "Pro",
      avatar_url: profilesMap.get(w.user_id)?.avatar_url ?? null,
      category_name: w.categories?.name ?? null,
      city: w.city, service_area: w.service_area,
      rating: w.rating, reviews_count: w.reviews_count,
      starting_price: w.starting_price, is_featured: w.is_featured,
      jobs_completed: w.jobs_completed,
      is_available: w.is_available,
      years_experience: w.years_experience,
    }));
  },
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Skill Link — Find Trusted Skilled Workers" },
      { name: "description", content: "Book verified electricians, plumbers, carpenters, painters and AC technicians across Accra." },
    ],
  }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(categoriesQuery),
    context.queryClient.ensureQueryData(featuredQuery),
  ]),
  component: Home,
});

function Home() {
  const { data: categories } = useSuspenseQuery(categoriesQuery);
  const { data: featured } = useSuspenseQuery(featuredQuery);
  const { user, effectiveRole, hasApplication } = useAppRole();
  const { data: myJobs } = useMyJobPostsSummary();
  const { data: busyIds } = useBusyWorkerIds();
  const role = effectiveRole;
  const navigate = useNavigate();

  // Anyone who has started the Professional journey lands on the Professional Dashboard.
  useEffect(() => {
    if (hasApplication) navigate({ to: "/worker/dashboard" });
  }, [hasApplication, navigate]);


  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground pb-8 pt-6 px-5 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between mb-6">
            <BrandLogo size={34} textClassName="text-lg text-primary-foreground" />

            {!user ? (
              <Link to="/auth" className="text-sm font-semibold underline">Sign in</Link>
            ) : (
              <Link to="/profile" className="text-sm font-semibold">Hi 👋</Link>
            )}
          </div>
          <h2 className="text-3xl font-extrabold leading-tight">Find trusted pros near you.</h2>
          <p className="mt-1 text-primary-foreground/80">Verified electricians, plumbers, carpenters, pool builders & more across Ghana.</p>
          <Link
            {...(user
              ? ({ to: "/workers" } as any)
              : ({ to: "/auth", search: { mode: "login", role: "customer" } } as any))}
            className="mt-5 flex items-center gap-3 rounded-2xl bg-card text-foreground px-4 py-3.5 shadow-elevated"
          >
            <Search className="size-5 text-muted-foreground" />
            <span className="text-muted-foreground">Search by skill, name, or area…</span>
          </Link>
          <Link
            {...(user
              ? ({ to: "/jobs/new" } as any)
              : ({ to: "/auth", search: { mode: "signup", role: "customer" } } as any))}
            className="mt-3 flex items-center gap-2 rounded-2xl bg-gold text-gold-foreground px-4 py-3 shadow-elevated font-semibold"
          >
            <Camera className="size-5" />
            <span className="text-sm">Post a job with photos or video</span>
            <ArrowRight className="size-4 ml-auto" />
          </Link>
          {user && (
            <Link
              to="/jobs/mine"
              className="mt-3 flex items-center gap-2 rounded-2xl bg-card text-foreground border border-border px-4 py-3 shadow-card font-semibold"
            >
              <ClipboardList className="size-5 text-primary" />
              <span className="text-sm">My Job Posts</span>
              {myJobs?.pending ? (
                <span className="ml-auto rounded-full bg-gold/25 text-gold-foreground text-[11px] font-bold px-2 py-0.5">
                  {myJobs.pending} awaiting review
                </span>
              ) : (
                <span className="ml-auto text-xs font-medium text-muted-foreground">
                  {myJobs?.jobCount ?? 0} posted
                </span>
              )}
            </Link>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-primary-foreground/80">
            <ShieldCheck className="size-4 text-gold" /> Ghana Card verified
            <span className="opacity-50">·</span>
            <Sparkles className="size-4 text-gold" /> Top-rated
          </div>

        </div>
      </header>


      <main className="mx-auto max-w-md px-5 py-6 space-y-8">
        {!user && <GuestGateCard />}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-bold">Browse services</h3>
            <Link
              {...(user
                ? ({ to: "/workers" } as any)
                : ({ to: "/auth", search: { mode: "login", role: "customer" } } as any))}
              className="text-sm font-semibold text-primary"
            >
              See all <ArrowRight className="inline size-3.5" />
            </Link>
          </div>
          <FeaturedCategoryGrid categories={categories} locked={!user} />

        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-bold">Top-rated pros</h3>
            <Link
              {...(user
                ? ({ to: "/workers" } as any)
                : ({ to: "/auth", search: { mode: "login", role: "customer" } } as any))}
              className="text-sm font-semibold text-primary"
            >
              See all
            </Link>
          </div>
          {featured.length === 0 ? (
            <EmptyWorkers />
          ) : (
            <div className="space-y-3">
              {withAvailabilityState(featured.slice(0, 3), busyIds).map((w) => (
                <WorkerCard key={w.user_id} w={w} locked={!user} />
              ))}
            </div>
          )}
        </section>


        {!user && (
          <section className="rounded-2xl bg-card border border-border p-5 shadow-card">
            <h4 className="font-display font-bold text-lg">Are you a skilled worker?</h4>
            <p className="text-sm text-muted-foreground mt-1">Get verified, list your services, and start earning.</p>
            <Link to="/auth" search={{ mode: "signup", role: "worker" }} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold">
              Join as a worker <ArrowRight className="size-4" />
            </Link>
          </section>
        )}

        {role === "admin" && (
          <Link to="/admin" className="block rounded-2xl bg-gold/15 border border-gold/30 p-4 text-sm font-semibold">
            Admin dashboard →
          </Link>
        )}
      </main>
    </AppShell>
  );
}

function EmptyWorkers() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      <p>No verified pros listed yet.</p>
      <p className="mt-1">Approved workers appear here automatically during Free Beta.</p>
    </div>
  );
}
