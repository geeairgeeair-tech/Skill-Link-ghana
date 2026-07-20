import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, MapPin, Image as ImageIcon, Video, Zap, AlertTriangle, ListChecks, Calendar, SlidersHorizontal, X, Users, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/")({
  component: JobsBoard,
});

type SortKey = "newest" | "urgent" | "budget_high" | "budget_low" | "soonest";

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function JobsBoard() {
  const { role, user } = useAuth();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState<string | undefined>();
  const [locationQ, setLocationQ] = useState("");
  const [urgency, setUrgency] = useState<string | undefined>();
  const [minBudget, setMinBudget] = useState<string>("");
  const [maxBudget, setMaxBudget] = useState<string>("");
  const [preferredFrom, setPreferredFrom] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("newest");

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, slug, name").eq("active", true).order("sort_order")).data ?? [],
  });

  const { data: workerProfile } = useQuery({
    queryKey: ["worker-profile-self", user?.id],
    enabled: !!user && role === "worker",
    queryFn: async () => (await supabase.from("worker_profiles")
      .select("category_id, service_area, city, verification_status, categories(name)")
      .eq("user_id", user!.id).maybeSingle()).data,
  });

  const isVerifiedWorker = role === "worker" && workerProfile?.verification_status === "approved";
  const isPendingOrRejected = role === "worker" && !!workerProfile && workerProfile.verification_status !== "approved";
  const workerCategoryId = workerProfile?.category_id;
  const workerCategoryName = (workerProfile as any)?.categories?.name;

  const { data: myAppliedIds } = useQuery({
    queryKey: ["my-application-job-ids", user?.id],
    enabled: !!user && role === "worker",
    queryFn: async () => {
      const { data } = await supabase.from("job_applications").select("job_id").eq("worker_id", user!.id);
      return new Set((data ?? []).map((r: any) => r.job_id));
    },
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["job-requests-all", category, urgency, minBudget, maxBudget, preferredFrom, sort, locationQ],
    queryFn: async () => {
      let q = supabase.from("job_requests")
        .select("id, title, description, budget, city, service_area, status, urgency, preferred_at, media, created_at, customer_id, category_id, categories(name, slug), profiles!job_requests_customer_id_fkey(full_name, city)")
        .eq("status", "open")
        .limit(100);
      if (category) {
        const cat = (cats ?? []).find(c => c.slug === category);
        if (cat) q = q.eq("category_id", cat.id);
      }
      if (urgency) q = q.eq("urgency", urgency as any);
      if (minBudget) q = q.gte("budget", Number(minBudget));
      if (maxBudget) q = q.lte("budget", Number(maxBudget));
      if (preferredFrom) q = q.gte("preferred_at", new Date(preferredFrom).toISOString());

      if (sort === "newest") q = q.order("created_at", { ascending: false });
      else if (sort === "urgent") q = q.order("urgency", { ascending: false }).order("created_at", { ascending: false });
      else if (sort === "budget_high") q = q.order("budget", { ascending: false, nullsFirst: false });
      else if (sort === "budget_low") q = q.order("budget", { ascending: true, nullsFirst: false });
      else if (sort === "soonest") q = q.order("preferred_at", { ascending: true, nullsFirst: false });

      const { data } = await q;
      let rows = data ?? [];
      const needle = locationQ.trim().toLowerCase();
      if (needle) {
        rows = rows.filter((j: any) =>
          (j.city ?? "").toLowerCase().includes(needle) ||
          (j.service_area ?? "").toLowerCase().includes(needle)
        );
      }
      return rows;
    },
  });

  const jobIds = useMemo(() => (jobs ?? []).map((j: any) => j.id), [jobs]);

  const { data: appCounts } = useQuery({
    queryKey: ["app-counts", jobIds],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("job_applications").select("job_id").in("job_id", jobIds);
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => map.set(r.job_id, (map.get(r.job_id) ?? 0) + 1));
      return map;
    },
  });

  const activeFilterCount =
    (category ? 1 : 0) + (urgency ? 1 : 0) + (minBudget ? 1 : 0) + (maxBudget ? 1 : 0) +
    (preferredFrom ? 1 : 0) + (locationQ.trim() ? 1 : 0) + (sort !== "newest" ? 1 : 0);

  const resetFilters = () => {
    setCategory(undefined); setUrgency(undefined); setMinBudget(""); setMaxBudget("");
    setPreferredFrom(""); setLocationQ(""); setSort("newest");
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Job board</h1>
            <p className="text-sm opacity-80">
              {role === "worker"
                ? (isVerifiedWorker
                    ? `Browse all open jobs. Apply to ${workerCategoryName ?? "your category"} jobs.`
                    : "Get verified to apply for jobs.")
                : "Posted by customers across Ghana."}
            </p>
          </div>
          {role === "worker" ? (
            <Link to="/worker/applications" className="h-11 px-3 rounded-full bg-primary-foreground/15 text-primary-foreground text-xs font-semibold inline-flex items-center gap-1">
              <ListChecks className="size-4"/> My apps
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/jobs/mine" className="h-11 px-3 rounded-full bg-primary-foreground/15 text-primary-foreground text-xs font-semibold inline-flex items-center gap-1">
                <ListChecks className="size-4"/> My posts
              </Link>
              <Link to="/jobs/new" className="size-11 grid place-items-center rounded-full bg-gold text-gold-foreground shadow-elevated" aria-label="Post a job">
                <Plus className="size-5"/>
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {isPendingOrRejected && (
          <div className="rounded-xl bg-gold/10 border border-gold/30 p-3 text-xs text-foreground">
            Your account is <b>{workerProfile!.verification_status}</b>. You can preview open jobs, but you'll be able to open full details and apply once an admin approves your profile.
          </div>
        )}

        {/* Filters bar */}
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 items-center">
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className="relative shrink-0 h-9 px-3 rounded-full border border-border bg-card text-xs font-semibold inline-flex items-center gap-1"
          >
            <SlidersHorizontal className="size-3.5"/> Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <Chip active={!category} onClick={() => setCategory(undefined)} label="All" />
          {(cats ?? []).map(c => (
            <Chip key={c.id} active={category === c.slug} onClick={() => setCategory(c.slug)} label={c.name} />
          ))}
        </div>

        {filtersOpen && (
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <div>
              <label className="text-[11px] uppercase font-bold text-muted-foreground">Location / area</label>
              <input value={locationQ} onChange={(e) => setLocationQ(e.target.value)} placeholder="e.g. East Legon, Kumasi"
                className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"/>
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Urgency</p>
              <div className="flex flex-wrap gap-2">
                {[["", "Any"], ["normal","Normal"], ["urgent","Urgent"], ["emergency","Emergency"]].map(([v, l]) => (
                  <Pill key={v} active={(urgency ?? "") === v} onClick={() => setUrgency(v || undefined)} label={l} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Budget (GH₵)</p>
              <div className="flex gap-2">
                <input inputMode="numeric" value={minBudget} onChange={(e) => setMinBudget(e.target.value.replace(/\D/g, ""))}
                  placeholder="Min" className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm"/>
                <input inputMode="numeric" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value.replace(/\D/g, ""))}
                  placeholder="Max" className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm"/>
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase font-bold text-muted-foreground">Preferred date from</label>
              <input type="date" value={preferredFrom} onChange={(e) => setPreferredFrom(e.target.value)}
                className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"/>
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1">Sort by</p>
              <div className="flex flex-wrap gap-2">
                {([
                  ["newest","Newest"],["urgent","Most urgent"],["soonest","Soonest date"],
                  ["budget_high","Budget: High → Low"],["budget_low","Budget: Low → High"]
                ] as const).map(([v,l]) => (
                  <Pill key={v} active={sort === v} onClick={() => setSort(v)} label={l} />
                ))}
              </div>
            </div>
            <button onClick={resetFilters} className="text-xs font-semibold text-primary inline-flex items-center gap-1">
              <X className="size-3.5"/> Reset filters
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
        ) : (jobs ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">No jobs match these filters.</p>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="mt-3 text-primary font-semibold">Clear filters</button>
            )}
          </div>
        ) : (jobs ?? []).map((j: any) => {
          const media: any[] = Array.isArray(j.media) ? j.media : [];
          const firstImg = media.find(m => m.type === "image");
          const vidCount = media.filter(m => m.type === "video").length;
          const imgCount = media.filter(m => m.type === "image").length;
          const inMyCategory = role === "worker" && isVerifiedWorker && workerCategoryId === j.category_id;
          const count = appCounts?.get(j.id) ?? 0;
          return (
            <Link key={j.id} to="/jobs/$id" params={{ id: j.id }} className="block rounded-2xl bg-card border border-border p-3 shadow-card hover:shadow-elevated">
              <div className="flex gap-3">
                {firstImg ? (
                  <SignedImage path={firstImg.path} className="size-20 rounded-xl object-cover bg-muted shrink-0" />
                ) : (
                  <div className="size-20 rounded-xl bg-primary-soft grid place-items-center text-primary shrink-0">
                    <ImageIcon className="size-6"/>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {j.urgency === "urgent" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gold text-gold-foreground inline-flex items-center gap-0.5"><Zap className="size-2.5"/>Urgent</span>}
                    {j.urgency === "emergency" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground inline-flex items-center gap-0.5"><AlertTriangle className="size-2.5"/>Emergency</span>}
                    {role === "worker" && myAppliedIds?.has(j.id) && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-success/20 text-success">Applied</span>}
                    {inMyCategory && !myAppliedIds?.has(j.id) && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/15 text-primary">Match</span>}
                    <p className="font-semibold truncate">{j.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{j.categories?.name ?? "General"}</p>
                  <p className="text-sm mt-1 line-clamp-2 text-muted-foreground">{j.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{j.service_area ?? j.city ?? j.profiles?.city ?? "Ghana"}</span>
                    {j.budget ? <span className="font-semibold text-primary">GH₵{j.budget}</span> : null}
                    {j.preferred_at && <span className="inline-flex items-center gap-1"><Calendar className="size-3"/>{new Date(j.preferred_at).toLocaleDateString()}</span>}
                    <span className="inline-flex items-center gap-1"><Clock className="size-3"/>{timeAgo(j.created_at)}</span>
                    <span className="inline-flex items-center gap-1"><Users className="size-3"/>{count}</span>
                    {imgCount > 0 && <span className="inline-flex items-center gap-0.5"><ImageIcon className="size-3"/>{imgCount}</span>}
                    {vidCount > 0 && <span className="inline-flex items-center gap-0.5"><Video className="size-3"/>{vidCount}</span>}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
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
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
      {label}
    </button>
  );
}

export function SignedImage({ path, className }: { path: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ["signed-url", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("job-media").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    staleTime: 50 * 60 * 1000,
  });
  if (!data) return <div className={className} />;
  return <img src={data} alt="" className={className} loading="lazy" />;
}
