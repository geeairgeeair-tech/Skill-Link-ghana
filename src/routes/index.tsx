import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Search, ShieldCheck, Sparkles, ArrowRight, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { CategoryIcon } from "@/components/category-icon";
import { WorkerCard, type WorkerCardData } from "@/components/worker-card";
import { useAuth } from "@/hooks/use-auth";


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
      .select("user_id, city, service_area, rating, reviews_count, starting_price, is_featured, jobs_completed, categories(name), profiles!worker_profiles_user_id_fkey(full_name, avatar_url)")
      .order("rating", { ascending: false })
      .limit(6);
    if (error) return [];
    return (data ?? []).map((w: any) => ({
      user_id: w.user_id,
      full_name: w.profiles?.full_name ?? "Pro",
      avatar_url: w.profiles?.avatar_url ?? null,
      category_name: w.categories?.name ?? null,
      city: w.city, service_area: w.service_area,
      rating: w.rating, reviews_count: w.reviews_count,
      starting_price: w.starting_price, is_featured: w.is_featured,
      jobs_completed: w.jobs_completed,
    }));
  },
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FixIt Ghana — Find Trusted Skilled Workers" },
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
  const { user, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (role === "worker") navigate({ to: "/worker/dashboard" });
  }, [role, navigate]);

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground pb-8 pt-6 px-5 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-lg bg-gold text-gold-foreground grid place-items-center font-extrabold">F</div>
              <h1 className="font-display text-lg font-extrabold">FixIt Ghana</h1>
            </div>
            {!user ? (
              <Link to="/auth" className="text-sm font-semibold underline">Sign in</Link>
            ) : (
              <Link to="/profile" className="text-sm font-semibold">Hi 👋</Link>
            )}
          </div>
          <h2 className="text-3xl font-extrabold leading-tight">Find trusted pros near you.</h2>
          <p className="mt-1 text-primary-foreground/80">Verified electricians, plumbers, carpenters, pool builders & more across Ghana.</p>
          <Link
            to="/workers"
            className="mt-5 flex items-center gap-3 rounded-2xl bg-card text-foreground px-4 py-3.5 shadow-elevated"
          >
            <Search className="size-5 text-muted-foreground" />
            <span className="text-muted-foreground">Search by skill, name, or area…</span>
          </Link>
          <Link
            to="/jobs/new"
            className="mt-3 flex items-center gap-2 rounded-2xl bg-gold text-gold-foreground px-4 py-3 shadow-elevated font-semibold"
          >
            <Camera className="size-5" />
            <span className="text-sm">Post a job with photos or video</span>
            <ArrowRight className="size-4 ml-auto" />
          </Link>
          <div className="mt-4 flex items-center gap-2 text-xs text-primary-foreground/80">
            <ShieldCheck className="size-4 text-gold" /> Ghana Card verified
            <span className="opacity-50">·</span>
            <Sparkles className="size-4 text-gold" /> Top-rated
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-md px-5 py-6 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-bold">Browse services</h3>
            <Link to="/workers" className="text-sm font-semibold text-primary">See all <ArrowRight className="inline size-3.5" /></Link>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                to="/workers"
                search={{ category: c.slug }}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div className="size-14 rounded-2xl bg-primary-soft grid place-items-center text-primary group-hover:scale-105 transition-transform shadow-card">
                  <CategoryIcon name={c.icon} className="size-6" />
                </div>
                <span className="text-[11px] font-medium text-center leading-tight">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-bold">Top-rated pros</h3>
            <Link to="/workers" className="text-sm font-semibold text-primary">See all</Link>
          </div>
          {featured.length === 0 ? (
            <EmptyWorkers />
          ) : (
            <div className="space-y-3">
              {featured.map((w) => <WorkerCard key={w.user_id} w={w} />)}
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
      <p className="mt-1">Workers appear here after verification + active subscription.</p>
    </div>
  );
}
