import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, MapPin, Image as ImageIcon, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/")({
  component: JobsBoard,
});

function JobsBoard() {
  const { role } = useAuth();
  const [category, setCategory] = useState<string | undefined>();

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, slug, name").eq("active", true).order("sort_order")).data ?? [],
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["job-requests", category],
    queryFn: async () => {
      let q = supabase.from("job_requests")
        .select("id, title, description, budget, city, status, media, created_at, customer_id, category_id, categories(name, slug), profiles!job_requests_customer_id_fkey(full_name, city)")
        .eq("status","open")
        .order("created_at", { ascending: false })
        .limit(50);
      if (category) {
        const cat = (cats ?? []).find(c => c.slug === category);
        if (cat) q = q.eq("category_id", cat.id);
      }
      return (await q).data ?? [];
    },
  });

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Job board</h1>
            <p className="text-sm opacity-80">
              {role === "worker" ? "Find jobs near you — call customers directly." : "Posted by customers in Ghana."}
            </p>
          </div>
          {role !== "worker" && (
            <Link to="/jobs/new" className="size-11 grid place-items-center rounded-full bg-gold text-gold-foreground shadow-elevated" aria-label="Post a job">
              <Plus className="size-5"/>
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
          <Chip active={!category} onClick={() => setCategory(undefined)} label="All" />
          {(cats ?? []).map(c => (
            <Chip key={c.id} active={category === c.slug} onClick={() => setCategory(c.slug)} label={c.name} />
          ))}
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
        ) : (jobs ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">No open jobs in this category yet.</p>
            {role !== "worker" && (
              <Link to="/jobs/new" className="mt-3 inline-block text-primary font-semibold">Post your job →</Link>
            )}
          </div>
        ) : (jobs ?? []).map((j: any) => {
          const media: any[] = Array.isArray(j.media) ? j.media : [];
          const firstImg = media.find(m => m.type === "image");
          const vidCount = media.filter(m => m.type === "video").length;
          const imgCount = media.filter(m => m.type === "image").length;
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
                  <div className="flex items-center gap-1">
                    <p className="font-semibold truncate">{j.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{j.categories?.name ?? "General"}</p>
                  <p className="text-sm mt-1 line-clamp-2 text-muted-foreground">{j.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{j.city ?? j.profiles?.city ?? "Ghana"}</span>
                    {j.budget ? <span className="font-semibold text-primary">GH₵{j.budget}</span> : null}
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
