import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Plus, Pencil, XCircle, Zap, AlertTriangle, FileText } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { SignedImage } from "./jobs.index";

export const Route = createFileRoute("/_authenticated/jobs/mine")({
  component: MyJobPosts,
});

const STATUS_STYLES: Record<string, string> = {
  open: "bg-primary-soft text-primary",
  assigned: "bg-gold/20 text-gold-foreground",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  draft: "bg-muted text-muted-foreground",
};

function MyJobPosts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [cancelFor, setCancelFor] = useState<{ id: string; title: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["my-job-requests", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase
      .from("job_requests")
      .select("id, title, description, budget, city, address, status, urgency, preferred_at, media, created_at, categories(name)")
      .eq("customer_id", user!.id)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const jobIds = (jobs ?? []).map((j: any) => j.id);
  const { data: appCounts } = useQuery({
    queryKey: ["my-jobs-app-counts", user?.id, jobIds.join(",")],
    enabled: !!user && jobIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("job_applications").select("job_id").in("job_id", jobIds);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.job_id] = (map[r.job_id] ?? 0) + 1; });
      return map;
    },
  });

  const submitCancel = async () => {
    if (!cancelFor) return;
    if (cancelReason.trim().length < 4) return toast.error("Please give a short reason");
    setCancelling(true);
    const { error } = await supabase.rpc("customer_cancel_job_request", {
      _job_id: cancelFor.id, _reason: cancelReason.trim(),
    } as any);
    setCancelling(false);
    if (error) return toast.error(error.message);
    toast.success("Job cancelled");
    setCancelFor(null); setCancelReason("");
    qc.invalidateQueries({ queryKey: ["my-job-requests"] });
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <div className="mb-2"><BackButton fallback="/" className="text-primary-foreground/90 hover:text-primary-foreground" /></div>
          <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">My job posts</h1>
            <p className="text-sm opacity-80">Track and manage jobs you've posted.</p>
          </div>
          <Link to="/jobs/new" className="size-11 grid place-items-center rounded-full bg-gold text-gold-foreground shadow-elevated" aria-label="Post a job">
            <Plus className="size-5"/>
          </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
        ) : (jobs ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">You haven't posted any jobs yet.</p>
            <Link to="/jobs/new" className="mt-3 inline-block text-primary font-semibold">Post your first job →</Link>
          </div>
        ) : (jobs ?? []).map((j: any) => {
          const media: any[] = Array.isArray(j.media) ? j.media : [];
          const firstImg = media.find(m => m.type === "image");
          const canEdit = j.status === "open";
          const canCancel = j.status === "open" || j.status === "assigned";
          return (
            <div key={j.id} className="rounded-2xl bg-card border border-border p-3 shadow-card">
              <Link to="/jobs/$id" params={{ id: j.id }} className="flex gap-3">
                {firstImg ? (
                  <SignedImage path={firstImg.path} className="size-20 rounded-xl object-cover bg-muted shrink-0" />
                ) : (
                  <div className="size-20 rounded-xl bg-primary-soft grid place-items-center text-primary shrink-0 text-xs font-semibold">
                    {j.categories?.name?.slice(0,2)?.toUpperCase() ?? "JOB"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[j.status] ?? "bg-muted"}`}>
                      {String(j.status).replace("_"," ")}
                    </span>
                    {j.urgency === "urgent" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gold text-gold-foreground inline-flex items-center gap-0.5"><Zap className="size-2.5"/>Urgent</span>}
                    {j.urgency === "emergency" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground inline-flex items-center gap-0.5"><AlertTriangle className="size-2.5"/>Emergency</span>}
                  </div>
                  <p className="font-semibold truncate mt-1">{j.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{j.categories?.name ?? "General"}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{j.city ?? "Ghana"}</span>
                    {j.budget ? <span className="font-semibold text-primary">GH₵{j.budget}</span> : null}
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <FileText className="size-3"/>{appCounts?.[j.id] ?? 0} application{(appCounts?.[j.id] ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </Link>
              {(canEdit || canCancel) && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                  {canEdit && (
                    <Link to="/jobs/$id/edit" params={{ id: j.id }} className="flex-1 h-9 rounded-lg border border-border text-xs font-semibold inline-flex items-center justify-center gap-1">
                      <Pencil className="size-3.5"/> Edit
                    </Link>
                  )}
                  {canCancel && (
                    <button onClick={() => setCancelFor({ id: j.id, title: j.title })} className="flex-1 h-9 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold inline-flex items-center justify-center gap-1">
                      <XCircle className="size-3.5"/> Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>

      {cancelFor && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center px-4" onClick={() => !cancelling && setCancelFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-lg">Cancel job post?</h3>
            <p className="text-xs text-muted-foreground mt-1 truncate">"{cancelFor.title}"</p>
            <p className="text-xs text-muted-foreground mt-2">Applicants will be notified. Why are you cancelling?</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="e.g. Found someone offline, no longer needed…"
              className="mt-2 w-full px-3 py-2 rounded-lg bg-muted text-sm"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setCancelFor(null)} disabled={cancelling} className="flex-1 h-10 rounded-lg border border-border text-sm font-semibold">Keep job</button>
              <button onClick={submitCancel} disabled={cancelling} className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50">
                {cancelling ? "Cancelling…" : "Cancel job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
