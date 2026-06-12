import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Search, SlidersHorizontal, ArrowLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { WorkerCard, type WorkerCardData } from "@/components/worker-card";

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  minRating: z.number().optional(),
});

export const Route = createFileRoute("/workers")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Browse Pros — FixIt Ghana" }] }),
  component: WorkersPage,
});

function WorkersPage() {
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minRating, setMinRating] = useState<number>(search.minRating ?? 0);
  const [category, setCategory] = useState<string | undefined>(search.category);

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").eq("active", true).order("sort_order")).data ?? [],
  });

  const { data: workers, isLoading } = useQuery({
    queryKey: ["workers", { q, category, minRating }],
    queryFn: async (): Promise<WorkerCardData[]> => {
      let query = supabase
        .from("worker_profiles")
        .select("user_id, city, service_area, rating, reviews_count, starting_price, is_featured, jobs_completed, is_available, categories!inner(name, slug), profiles!worker_profiles_user_id_fkey(full_name, avatar_url)")
        .gte("rating", minRating)
        .order("is_available", { ascending: false })
        .order("is_featured", { ascending: false })
        .order("rating", { ascending: false })
        .limit(50);
      if (category) query = query.eq("categories.slug", category);
      const { data } = await query;
      let list = (data ?? []).map((w: any) => ({
        user_id: w.user_id,
        full_name: w.profiles?.full_name ?? "Pro",
        avatar_url: w.profiles?.avatar_url ?? null,
        category_name: w.categories?.name ?? null,
        city: w.city, service_area: w.service_area,
        rating: w.rating, reviews_count: w.reviews_count,
        starting_price: w.starting_price, is_featured: w.is_featured,
        jobs_completed: w.jobs_completed,
        is_available: w.is_available,
      }));
      if (q.trim()) {
        const needle = q.toLowerCase();
        list = list.filter(w =>
          w.full_name.toLowerCase().includes(needle) ||
          (w.category_name ?? "").toLowerCase().includes(needle) ||
          (w.service_area ?? "").toLowerCase().includes(needle)
        );
      }
      return list;
    },
  });

  return (
    <AppShell>
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-md px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Link to="/" className="size-9 grid place-items-center rounded-full bg-muted"><ArrowLeft className="size-4" /></Link>
            <h1 className="font-display text-xl font-bold">Browse Pros</h1>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Skill, name, or area"
                className="w-full pl-9 pr-3 py-3 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className="size-12 grid place-items-center rounded-xl border border-input bg-card"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
            <Chip active={!category} onClick={() => setCategory(undefined)} label="All" />
            {(cats ?? []).map(c => (
              <Chip key={c.id} active={category === c.slug} onClick={() => setCategory(c.slug)} label={c.name} />
            ))}
          </div>
          {filtersOpen && (
            <div className="mt-3 rounded-xl bg-card border border-border p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold mb-2">Minimum rating</p>
                <div className="flex gap-2">
                  {[0,3,4,4.5].map(r => (
                    <button key={r} onClick={() => setMinRating(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${minRating===r ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {r === 0 ? "Any" : `${r}+`}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => { setMinRating(0); setCategory(undefined); setQ(""); }} className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <X className="size-3" /> Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-md px-5 py-4 space-y-3">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-12">Loading…</p>
        ) : workers && workers.length > 0 ? (
          workers.map(w => <WorkerCard key={w.user_id} w={w} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">No pros match your search.</p>
            <p className="mt-1">Only verified workers with active subscriptions appear here.</p>
          </div>
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
