import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { BadgeCheck, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data: pending } = useQuery({
    queryKey: ["admin-pending"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("worker_profiles")
        .select("user_id, years_experience, bio, profiles!worker_profiles_user_id_fkey(full_name, phone), categories(name)")
        .eq("verification_status","pending");
      const enriched = await Promise.all((rows ?? []).map(async (r: any) => {
        const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: r.user_id });
        return { ...r, ghana_card_number: (ident as any)?.[0]?.ghana_card_number ?? null };
      }));
      return enriched;
    },
  });
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    enabled: role === "admin",
    queryFn: async () => {
      const [workers, bookings, customers] = await Promise.all([
        supabase.from("worker_profiles").select("user_id", { count:"exact", head:true }),
        supabase.from("bookings").select("id", { count:"exact", head:true }),
        supabase.from("profiles").select("id", { count:"exact", head:true }),
      ]);
      return { workers: workers.count ?? 0, bookings: bookings.count ?? 0, customers: customers.count ?? 0 };
    },
  });

  const decide = async (id: string, status: "approved"|"rejected") => {
    const { error } = await supabase.from("worker_profiles").update({ verification_status: status }).eq("user_id", id);
    if (error) return toast.error(error.message);
    toast.success(`Worker ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-pending"] });
  };

  if (role !== "admin") {
    return <AppShell><div className="p-8 text-center"><p>Admin access required.</p></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <h1 className="font-display text-2xl font-bold">Admin</h1>
        <p className="text-sm opacity-80">FixIt Ghana operations</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Workers" value={stats?.workers ?? 0} />
          <Stat label="Bookings" value={stats?.bookings ?? 0} />
          <Stat label="Users" value={stats?.customers ?? 0} />
        </div>

        <section className="rounded-2xl bg-card border border-border p-4">
          <h3 className="font-display font-bold mb-3">Pending verification ({pending?.length ?? 0})</h3>
          {(pending ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending applications.</p>
          ) : (pending ?? []).map((w:any) => (
            <div key={w.user_id} className="py-3 border-t border-border first:border-0">
              <p className="font-semibold">{w.profiles?.full_name}</p>
              <p className="text-xs text-muted-foreground">{w.categories?.name} · {w.years_experience}y exp · Ghana Card: {w.ghana_card_number}</p>
              {w.bio && <p className="text-sm mt-1">{w.bio}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => decide(w.user_id,"approved")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success text-success-foreground text-xs font-semibold"><BadgeCheck className="size-3"/> Approve</button>
                <button onClick={() => decide(w.user_id,"rejected")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold"><X className="size-3"/> Reject</button>
              </div>
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
function Stat({ label, value }: any) {
  return <div className="rounded-xl bg-card border border-border p-3 text-center"><p className="font-display font-bold text-2xl text-primary">{value}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}
