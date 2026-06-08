import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/jobs")({
  component: JobsPage,
});

function JobsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["worker-jobs", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("bookings").select("*, profiles!bookings_customer_id_fkey(full_name, phone)").eq("worker_id", user!.id).order("created_at",{ascending:false})).data ?? [],
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("bookings").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
  };

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3 mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold">Jobs</h1>
      </header>
      <main className="mx-auto max-w-md px-5 space-y-3">
        {(data ?? []).length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No incoming jobs yet.</p>
        ) : (data ?? []).map((b:any) => (
          <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{b.profiles?.full_name}</p>
              <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{b.status.replace(/_/g," ")}</span>
            </div>
            <p className="text-sm mt-1">{b.description}</p>
            {b.address && <p className="text-xs text-muted-foreground mt-1">📍 {b.address}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {b.status === "pending" && <>
                <Btn onClick={() => updateStatus(b.id,"accepted")}>Accept</Btn>
                <Btn variant="ghost" onClick={() => updateStatus(b.id,"cancelled")}>Decline</Btn>
              </>}
              {b.status === "accepted" && <Btn onClick={() => updateStatus(b.id,"on_the_way")}>On the way</Btn>}
              {b.status === "on_the_way" && <Btn onClick={() => updateStatus(b.id,"in_progress")}>Start job</Btn>}
              {b.status === "in_progress" && <Btn onClick={() => updateStatus(b.id,"completed")}>Mark complete</Btn>}
            </div>
          </div>
        ))}
      </main>
    </AppShell>
  );
}
function Btn({ onClick, children, variant }: any) {
  return <button onClick={onClick} className={`px-3 py-2 rounded-lg text-xs font-semibold ${variant==="ghost" ? "bg-muted" : "bg-primary text-primary-foreground"}`}>{children}</button>;
}
