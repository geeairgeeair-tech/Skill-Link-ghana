import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/support")({
  component: AdminSupportPage,
});

function AdminSupportPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("open");
  const [replies, setReplies] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-support", status],
    enabled: role === "admin",
    queryFn: async () => {
      let q = supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((t: any) => t.user_id)));
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((t: any) => ({ ...t, user: map.get(t.user_id) }));
    },
  });

  const tickets = useMemo(() => data ?? [], [data]);

  const respond = async (id: string) => {
    const text = (replies[id] ?? "").trim();
    if (text.length < 2) return toast.error("Enter a response");
    const { error } = await supabase.from("support_tickets").update({
      admin_response: text, admin_id: user?.id, responded_at: new Date().toISOString(), status: "in_review",
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Response sent");
    setReplies((r) => ({ ...r, [id]: "" }));
    qc.invalidateQueries({ queryKey: ["admin-support"] });
  };

  const setTicketStatus = async (id: string, s: string) => {
    const { error } = await supabase.from("support_tickets").update({ status: s }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-support"] });
  };

  if (role && role !== "admin") return <AppShell><div className="p-8 text-center"><p>Admin access required.</p></div></AppShell>;

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-2xl font-bold mt-2">Support tickets</h1>
        <p className="text-sm opacity-80">User inquiries</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-3">
          <div className="flex gap-1 text-xs font-semibold overflow-x-auto">
            {["open", "in_review", "resolved", "closed", "all"].map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : tickets.length === 0 ? <p className="text-sm text-muted-foreground">No tickets.</p>
            : tickets.map((t: any) => (
              <div key={t.id} className="py-2 border-t border-border first:border-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{t.subject}</p>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted">{t.status}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">From {t.user?.full_name ?? "—"} · {t.category} · {new Date(t.created_at).toLocaleString()}</p>
                <p className="text-xs whitespace-pre-wrap">{t.message}</p>
                {t.admin_response && (
                  <div className="rounded-lg bg-primary-soft border border-primary/20 p-2 text-xs mt-1">
                    <p className="font-semibold text-primary">Your response</p>
                    <p className="whitespace-pre-wrap">{t.admin_response}</p>
                  </div>
                )}
                <textarea
                  value={replies[t.id] ?? ""}
                  onChange={(e) => setReplies((r) => ({ ...r, [t.id]: e.target.value }))}
                  placeholder="Reply to user…"
                  rows={2}
                  className="w-full px-2 py-1.5 rounded-lg bg-muted text-xs mt-1"
                />
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => respond(t.id)} className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground font-bold">Send reply</button>
                  <button onClick={() => setTicketStatus(t.id, "in_review")} className="text-[10px] px-2 py-1 rounded bg-muted font-bold">In review</button>
                  <button onClick={() => setTicketStatus(t.id, "resolved")} className="text-[10px] px-2 py-1 rounded bg-success text-success-foreground font-bold">Resolved</button>
                  <button onClick={() => setTicketStatus(t.id, "closed")} className="text-[10px] px-2 py-1 rounded bg-muted font-bold">Close</button>
                </div>
              </div>
            ))}
        </section>
      </main>
    </AppShell>
  );
}
