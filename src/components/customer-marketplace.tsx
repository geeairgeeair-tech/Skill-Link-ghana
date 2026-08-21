import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, PlusSquare, Calendar } from "lucide-react";
import { fetchPrimaryAreaNames } from "@/lib/service-areas";
import { supabase } from "@/integrations/supabase/client";
import { CategoryIcon } from "@/components/category-icon";
import { WorkerCard, type WorkerCardData } from "@/components/worker-card";
import { bookingTimingLines } from "@/lib/job-timing";
import { useAuth } from "@/hooks/use-auth";
import { useBusyWorkerIds, withAvailabilityState } from "@/hooks/use-busy-workers";
import { useCustomerActionCount } from "@/hooks/use-action-badges";


/** Slugs shown as the "everyday services" shortlist on home / hire surfaces. */
export const FEATURED_CATEGORY_SLUGS = [
  "electrician",
  "plumber",
  "appliance-repair",
  "carpenter",
  "heavy-goods-driver",
  "cleaner",
  "mechanic",
  "dispatch-rider",
  "nanny",
  "ac-tech",
  "private-teacher",
  "private-nurse",
];


export function FeaturedCategoryGrid({
  categories,
  locked = false,
}: {
  categories: any[];
  locked?: boolean;
}) {
  const order = new Map(FEATURED_CATEGORY_SLUGS.map((s, i) => [s, i]));
  const shortlist = (categories ?? [])
    .filter((c: any) => order.has(c.slug))
    .sort((a: any, b: any) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99));
  const list = shortlist.length ? shortlist : (categories ?? []).slice(0, 8);

  return (
    <div className="grid grid-cols-4 gap-3">
      {list.map((c: any) => (
        <Link
          key={c.id}
          {...(locked
            ? ({ to: "/auth", search: { mode: "login", role: "customer" } } as any)
            : ({ to: "/workers", search: { category: c.slug } } as any))}
          className="flex flex-col items-center gap-1.5 group"
        >
          <div className="size-14 rounded-2xl bg-primary-soft grid place-items-center text-primary group-hover:scale-105 transition-transform shadow-card">
            <CategoryIcon name={c.icon} className="size-6" />
          </div>
          <span className="text-[11px] font-medium text-center leading-tight">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}


/**
 * Customer marketplace block reused inside the professional experience so a
 * professional keeps every customer capability on one continuous platform.
 */
export function CustomerMarketplaceSection() {
  const { user } = useAuth();
  const { data: busyIds } = useBusyWorkerIds();
  const customerActions = useCustomerActionCount();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    staleTime: 30 * 60_000,

    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: recommended } = useQuery({
    queryKey: ["recommended-workers", user?.id],
    staleTime: 5 * 60_000,

    queryFn: async (): Promise<WorkerCardData[]> => {
      const { data } = await supabase
        .from("worker_profiles")
        .select(
          "user_id, city, service_area, rating, reviews_count, starting_price, is_featured, jobs_completed, is_available, years_experience, verification_status, categories(name)",
        )
        .eq("verification_status", "approved")
        .order("is_featured", { ascending: false })
        .order("rating", { ascending: false })
        .limit(5);
      const rows = (data ?? []).filter((w: any) => w.user_id !== user?.id).slice(0, 3);
      const ids = rows.map((w: any) => w.user_id);
      const map = new Map<string, any>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => map.set(p.id, p));
      }
      const primaryAreas = await fetchPrimaryAreaNames(ids);
      return rows.map((w: any) => ({
        user_id: w.user_id,
        full_name: map.get(w.user_id)?.full_name ?? "Pro",
        avatar_url: map.get(w.user_id)?.avatar_url ?? null,
        category_name: w.categories?.name ?? null,
        city: w.city,
        service_area: primaryAreas.get(w.user_id) ?? w.service_area,
        rating: w.rating,
        reviews_count: w.reviews_count,
        starting_price: w.starting_price,
        is_featured: w.is_featured,
        jobs_completed: w.jobs_completed,
        is_available: w.is_available,
        years_experience: w.years_experience,
        verification_status: w.verification_status,
      }));
    },
  });

  const { data: myBookings } = useQuery({
    queryKey: ["my-customer-bookings", user?.id],
    enabled: !!user,
    staleTime: 60_000,

    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, status, description, scheduled_at, timing_type, preferred_window, duration_type, duration_start_date, duration_end_date, created_at, categories(name)")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-bold">Hire professionals</h2>
        <p className="text-sm text-muted-foreground">
          Need help yourself? Book any verified pro on Skill Link.
        </p>
        <Link
          to="/workers"
          className="mt-3 flex items-center gap-3 rounded-2xl bg-card border border-border px-4 py-3.5 shadow-card"
        >
          <Search className="size-5 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Search by skill, name, or area…</span>
        </Link>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link
            to="/jobs/new"
            className="rounded-2xl bg-gold text-gold-foreground px-4 py-3 font-semibold text-sm inline-flex items-center gap-2 shadow-card"
          >
            <PlusSquare className="size-4" /> Post a job
          </Link>
          <Link
            to="/bookings"
            className="relative rounded-2xl bg-card border border-border px-4 py-3 font-semibold text-sm inline-flex items-center gap-2"
          >
            <Calendar className="size-4 text-primary" /> My Hires
            {customerActions > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
                {customerActions > 9 ? "9+" : customerActions}
              </span>
            )}
          </Link>

        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold">Browse services</h2>
          <Link to="/workers" className="text-sm font-semibold text-primary">
            See all <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
        <FeaturedCategoryGrid categories={categories ?? []} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold">Recommended professionals</h2>
          <Link to="/workers" className="text-sm font-semibold text-primary">
            See all
          </Link>
        </div>
        {(recommended ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No professionals listed yet.</p>
        ) : (
          <div className="space-y-3">
            {(recommended ?? []).map((w) => (
              <WorkerCard key={w.user_id} w={w} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold">My Hires — bookings I created</h2>
          <Link to="/bookings" className="text-sm font-semibold text-primary">
            See all
          </Link>
        </div>
        {(myBookings ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven't booked anyone yet. Browse pros above to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {(myBookings ?? []).map((b: any) => (
              <Link
                key={b.id}
                to="/bookings/$bookingId"
                params={{ bookingId: b.id }}
                className="block rounded-2xl bg-card border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{b.categories?.name ?? "Service"}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
                    {bookingTimingLines(b).map((l: string) => (
                      <p key={l} className="text-[11px] text-muted-foreground mt-0.5">{l}</p>
                    ))}
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary-soft text-primary">
                    {String(b.status).replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
