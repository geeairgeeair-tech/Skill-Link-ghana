import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, PlusSquare, Calendar, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CategoryIcon } from "@/components/category-icon";
import { WorkerCard, type WorkerCardData } from "@/components/worker-card";
import { useAuth } from "@/hooks/use-auth";

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
];

export function FeaturedCategoryGrid({ categories }: { categories: any[] }) {
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
  );
}

/**
 * Customer marketplace block reused inside the professional experience so a
 * professional keeps every customer capability on one continuous platform.
 */
export function CustomerMarketplaceSection() {
  const { user } = useAuth();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
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
      const rows = (data ?? []).filter((w: any) => w.user_id !== user?.id).slice(0, 4);
      const ids = rows.map((w: any) => w.user_id);
      const map = new Map<string, any>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => map.set(p.id, p));
      }
      return rows.map((w: any) => ({
        user_id: w.user_id,
        full_name: map.get(w.user_id)?.full_name ?? "Pro",
        avatar_url: map.get(w.user_id)?.avatar_url ?? null,
        category_name: w.categories?.name ?? null,
        city: w.city,
        service_area: w.service_area,
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
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, status, description, scheduled_at, created_at, categories(name)")
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
            className="rounded-2xl bg-card border border-border px-4 py-3 font-semibold text-sm inline-flex items-center gap-2"
          >
            <Calendar className="size-4 text-primary" /> My bookings
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
          <h2 className="font-display text-lg font-bold">My customer bookings</h2>
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

      <section className="rounded-2xl bg-primary-soft/60 border border-border p-4">
        <p className="font-display font-bold inline-flex items-center gap-2">
          <Megaphone className="size-4 text-primary" /> Platform updates
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc pl-4">
          <li>You can now hire other professionals without a second account.</li>
          <li>Bookings, chat and notifications are shared across both experiences.</li>
          <li>Free Beta — no commission on completed jobs.</li>
        </ul>
      </section>
    </div>
  );
}
