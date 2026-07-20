import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Search, SlidersHorizontal, X, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { WorkerCard, type WorkerCardData } from "@/components/worker-card";

const SORTS = ["rating", "experience", "jobs", "newest"] as const;
type SortKey = typeof SORTS[number];

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  category: fallback(z.string(), "").default(""),
  minRating: fallback(z.number(), 0).default(0),
  minExperience: fallback(z.number(), 0).default(0),
  availableOnly: fallback(z.boolean(), false).default(false),
  sort: fallback(z.string(), "rating").default("rating"),
});

export const Route = createFileRoute("/workers")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Browse Verified Pros — Skill Link Ghana" },
      { name: "description", content: "Search verified electricians, plumbers, carpenters and more across Ghana. Filter by rating, experience, availability." },
    ],
  }),
  component: WorkersPage,
});

function WorkersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/workers" });
  const [q, setQ] = useState(search.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const category = search.category || undefined;
  const sort = (SORTS.includes(search.sort as SortKey) ? search.sort : "rating") as SortKey;

  type SearchState = z.infer<typeof searchSchema>;
  const setSearch = (patch: Partial<SearchState>) =>
    navigate({ search: (prev: SearchState) => ({ ...prev, ...patch }) });

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").eq("active", true).order("sort_order")).data ?? [],
  });

  const { data: workers, isLoading, isError, refetch } = useQuery({
    queryKey: ["workers", { category, minRating: search.minRating, minExperience: search.minExperience, availableOnly: search.availableOnly, sort }],
    queryFn: async (): Promise<WorkerCardData[]> => {
      let query = supabase
        .from("worker_profiles")
        .select("user_id, city, service_area, rating, reviews_count, starting_price, is_featured, jobs_completed, is_available, years_experience, created_at, categories!inner(name, slug)")
        .eq("verification_status", "approved")
        .gte("rating", search.minRating)
        .gte("years_experience", search.minExperience)
        .limit(100);
      if (category) query = query.eq("categories.slug", category);
      if (search.availableOnly) query = query.eq("is_available", true);

      if (sort === "rating") query = query.order("is_featured", { ascending: false }).order("rating", { ascending: false }).order("jobs_completed", { ascending: false }).order("is_available", { ascending: false });
      else if (sort === "experience") query = query.order("years_experience", { ascending: false });
      else if (sort === "jobs") query = query.order("jobs_completed", { ascending: false });
      else if (sort === "newest") query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
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
        city: w.city,
        service_area: w.service_area,
        rating: w.rating,
        reviews_count: w.reviews_count,
        starting_price: w.starting_price,
        is_featured: w.is_featured,
        jobs_completed: w.jobs_completed,
        is_available: w.is_available,
        years_experience: w.years_experience,
      }));
    },
  });


  const filtered = useMemo(() => {
    if (!workers) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return workers;
    return workers.filter(w =>
      (w.full_name ?? "").toLowerCase().includes(needle) ||
      (w.category_name ?? "").toLowerCase().includes(needle) ||
      (w.service_area ?? "").toLowerCase().includes(needle) ||
      (w.city ?? "").toLowerCase().includes(needle)
    );
  }, [workers, q]);

  const activeFilterCount =
    (category ? 1 : 0) +
    (search.minRating > 0 ? 1 : 0) +
    (search.minExperience > 0 ? 1 : 0) +
    (search.availableOnly ? 1 : 0) +
    (sort !== "rating" ? 1 : 0);

  const resetAll = () => {
    setQ("");
    navigate({ search: { q: "", category: "", minRating: 0, minExperience: 0, availableOnly: false, sort: "rating" } });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-md px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <BackButton fallback="/" />
            <h1 className="font-display text-xl font-bold">Browse Pros</h1>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, profession, or area"
                aria-label="Search workers"
                className="w-full pl-9 pr-3 py-3 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className="relative size-12 grid place-items-center rounded-xl border border-input bg-card"
              aria-label="Filters"
            >
              <SlidersHorizontal className="size-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
            <Chip active={!category} onClick={() => setSearch({ category: "" })} label="All" />
            {(cats ?? []).map(c => (
              <Chip key={c.id} active={category === c.slug} onClick={() => setSearch({ category: c.slug })} label={c.name} />
            ))}
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" />
            <span>Showing verified pros only</span>
          </div>

          {filtersOpen && (
            <div className="mt-3 rounded-xl bg-card border border-border p-3 space-y-4">
              <FilterGroup label="Sort by">
                {([
                  ["rating", "Top rated"],
                  ["experience", "Most experienced"],
                  ["jobs", "Most jobs done"],
                  ["newest", "Newest"],
                ] as const).map(([val, label]) => (
                  <Pill key={val} active={sort === val} onClick={() => setSearch({ sort: val })} label={label} />
                ))}
              </FilterGroup>

              <FilterGroup label="Minimum rating">
                {[0, 3, 4, 4.5].map(r => (
                  <Pill key={r} active={search.minRating === r} onClick={() => setSearch({ minRating: r })} label={r === 0 ? "Any" : `${r}+`} />
                ))}
              </FilterGroup>

              <FilterGroup label="Minimum experience">
                {[0, 1, 3, 5, 10].map(y => (
                  <Pill key={y} active={search.minExperience === y} onClick={() => setSearch({ minExperience: y })} label={y === 0 ? "Any" : `${y}+ yrs`} />
                ))}
              </FilterGroup>

              <FilterGroup label="Availability">
                <Pill active={!search.availableOnly} onClick={() => setSearch({ availableOnly: false })} label="All" />
                <Pill active={search.availableOnly} onClick={() => setSearch({ availableOnly: true })} label="Available now" />
              </FilterGroup>

              <button
                onClick={resetAll}
                className="text-xs font-semibold text-primary inline-flex items-center gap-1"
              >
                <X className="size-3.5" /> Reset filters
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-md px-5 py-4 space-y-3">
        {isLoading ? (
          <SkeletonList />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filtered.length > 0 ? (
          filtered.map(w => <WorkerCard key={w.user_id} w={w} />)
        ) : (
          <EmptyState hasFilters={activeFilterCount > 0 || q.trim().length > 0} onReset={resetAll} />
        )}
      </main>
    </AppShell>
  );
}

function Chip({ active, onClick, label }: { active?: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"}`}>
      {label}
    </button>
  );
}

function Pill({ active, onClick, label }: { active?: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}>
      {label}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-3 shadow-card animate-pulse">
          <div className="flex gap-3">
            <div className="size-16 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3.5 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">
        {hasFilters ? "No pros match your search." : "No verified pros listed yet."}
      </p>
      <p className="mt-1">
        {hasFilters ? "Try clearing filters or broadening your search." : "Check back soon — new pros are being verified regularly."}
      </p>
      {hasFilters && (
        <button onClick={onReset} className="mt-4 inline-flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold">
          <X className="size-3.5" /> Reset filters
        </button>
      )}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm">
      <p className="font-semibold text-destructive">Couldn't load pros.</p>
      <p className="mt-1 text-muted-foreground">Please check your connection and try again.</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold">
        Retry
      </button>
    </div>
  );
}
