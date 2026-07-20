import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Pencil, XCircle, CheckCircle2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/applications")({
  component: MyApplicationsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-primary-soft text-primary",
  accepted: "bg-success/20 text-success",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
};

function MyApplicationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-applications", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("job_applications")
      .select("id, status, quoted_price, estimated_start, message, created_at, job_id, job_requests(id, title, city, status, urgency, budget, categories(name))")
      .eq("worker_id", user!.id)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const withdraw = async (id: string) => {
    if (!confirm("Withdraw this application?")) return;
    const { error } = await supabase.from("job_applications").update({ status: "withdrawn" as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Application withdrawn");
    qc.invalidateQueries({ queryKey: ["my-applications"] });
    qc.invalidateQueries({ queryKey: ["my-application-job-ids"] });
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <div className="mb-2"><BackButton fallback="/jobs" className="text-primary-foreground/90 hover:text-primary-foreground" /></div>
          <h1 className="font-display text-2xl font-bold">My applications</h1>
          <p className="text-sm opacity-80">Jobs you've applied to.</p>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <FileText className="size-8 mx-auto text-muted-foreground/50 mb-2"/>
            <p className="font-semibold text-foreground">No applications yet</p>
            <Link to="/jobs" className="mt-3 inline-block text-primary font-semibold">Browse the job board →</Link>
          </div>
        ) : (data ?? []).map((a: any) => {
          const job = a.job_requests;
          const canEdit = a.status === "pending" && job?.status === "open";
          return (
            <div key={a.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[a.status] ?? "bg-muted"}`}>
                  {a.status}
                </span>
                <span className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              <Link to="/jobs/$id" params={{ id: a.job_id }} className="block">
                <p className="font-semibold truncate">{job?.title ?? "Job"}</p>
                <p className="text-xs text-muted-foreground truncate">{job?.categories?.name ?? "General"} · {job?.city ?? "Ghana"}</p>
              </Link>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="font-semibold text-primary">Your quote: GH₵{a.quoted_price}</span>
                {a.estimated_start && <span className="text-muted-foreground">Start: {new Date(a.estimated_start).toLocaleString()}</span>}
              </div>
              {a.message && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">"{a.message}"</p>}
              {a.status === "accepted" && (
                <div className="mt-2 rounded-lg bg-success/10 p-2 text-xs text-success inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3.5"/> Accepted — the customer will be in touch.
                </div>
              )}
              {canEdit && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                  <Link to="/jobs/$id/apply" params={{ id: a.job_id }} className="flex-1 h-9 rounded-lg border border-border text-xs font-semibold inline-flex items-center justify-center gap-1">
                    <Pencil className="size-3.5"/> Edit
                  </Link>
                  <button onClick={() => withdraw(a.id)} className="flex-1 h-9 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold inline-flex items-center justify-center gap-1">
                    <XCircle className="size-3.5"/> Withdraw
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </main>
    </AppShell>
  );
}
