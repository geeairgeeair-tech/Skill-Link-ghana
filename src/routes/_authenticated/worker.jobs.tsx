import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircle, MapPin, Calendar, Wallet, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/jobs")({
  component: JobsPage,
});

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined/Cancelled" },
] as const;
type TabKey = typeof TABS[number]["key"];

function matchesTab(status: string, tab: TabKey) {
  if (tab === "accepted") return status === "accepted" || status === "on_the_way" || status === "arrived";
  if (tab === "declined") return status === "declined" || status === "cancelled";
  return status === tab;
}

function JobsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("pending");
  const [mediaByBooking, setMediaByBooking] = useState<Record<string, string[]>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["worker-jobs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error: qErr } = await supabase
        .from("bookings")
        .select("*, categories(name)")
        .eq("worker_id", user!.id)
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean)));
      let profMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      }
      return (rows ?? []).map((r: any) => ({ ...r, profiles: profMap[r.customer_id] ?? null }));
    },
  });

  // Realtime updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`worker-jobs:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["worker-jobs", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { pending: 0, accepted: 0, in_progress: 0, completed: 0, declined: 0 };
    (data ?? []).forEach((b: any) => {
      TABS.forEach(t => { if (matchesTab(b.status, t.key)) c[t.key]++; });
    });
    return c;
  }, [data]);

  const visible = (data ?? []).filter((b: any) => matchesTab(b.status, tab));

  // Lazy-load signed media URLs for visible bookings
  useEffect(() => {
    (async () => {
      for (const b of visible) {
        if (mediaByBooking[b.id]) continue;
        const prefix = `${b.customer_id}/bookings/${b.id}`;
        const { data: list } = await supabase.storage.from("job-media").list(prefix, { limit: 20 });
        if (!list || list.length === 0) { setMediaByBooking(m => ({ ...m, [b.id]: [] })); continue; }
        const paths = list.map(o => `${prefix}/${o.name}`);
        const { data: signed } = await supabase.storage.from("job-media").createSignedUrls(paths, 60 * 60);
        setMediaByBooking(m => ({ ...m, [b.id]: (signed ?? []).map(s => s.signedUrl).filter(Boolean) as string[] }));
      }
    })();
     
  }, [visible.map(b => b.id).join(",")]);

  const updateStatus = async (id: string, status: string) => {
    const { error: uErr } = await supabase.from("bookings").update({ status: status as any }).eq("id", id);
    if (uErr) return toast.error(uErr.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["worker-jobs"] });
    qc.invalidateQueries({ queryKey: ["worker-bookings"] });
  };

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3 mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold">Jobs</h1>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${tab === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              {t.label} <span className="opacity-70">({counts[t.key]})</span>
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 space-y-3">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-12">Loading jobs…</p>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold text-destructive">Couldn't load jobs.</p>
            <button onClick={() => refetch()} className="mt-2 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">Retry</button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No {TABS.find(t=>t.key===tab)?.label.toLowerCase()} jobs.</p>
        ) : visible.map((b: any) => {
          const media = mediaByBooking[b.id] ?? [];
          return (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{b.profiles?.full_name ?? "Customer"}</p>
                  <p className="text-xs text-muted-foreground">{b.categories?.name ?? "Service"}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{b.status.replace(/_/g," ")}</span>
                  {b.urgency && b.urgency !== "normal" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-warning-foreground bg-warning/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="size-3"/>{b.urgency}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm mt-2">{b.description}</p>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                {b.scheduled_at && <p className="inline-flex items-center gap-1"><Calendar className="size-3"/>{new Date(b.scheduled_at).toLocaleString()}</p>}
                {b.service_area && <p className="inline-flex items-center gap-1"><MapPin className="size-3"/>{b.service_area}</p>}
                {b.budget && <p className="inline-flex items-center gap-1"><Wallet className="size-3"/>Budget GH₵{b.budget}</p>}
                {b.status !== "pending" && b.address && <p className="text-foreground/80">📍 {b.address}</p>}
              </div>

              {media.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {media.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={url} alt="attachment" className="size-20 rounded-lg object-cover border border-border" />
                    </a>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {b.status === "pending" && <>
                  <Btn onClick={() => updateStatus(b.id, "accepted")}>Accept</Btn>
                  <Btn variant="ghost" onClick={() => updateStatus(b.id, "declined")}>Decline</Btn>
                </>}
                {b.status === "accepted" && <Btn onClick={() => updateStatus(b.id, "on_the_way")}>On the way</Btn>}
                {b.status === "on_the_way" && <Btn onClick={() => updateStatus(b.id, "arrived")}>Mark arrived</Btn>}
                {b.status === "arrived" && <Btn onClick={() => updateStatus(b.id, "in_progress")}>Start job</Btn>}
                {b.status === "in_progress" && <Btn onClick={() => updateStatus(b.id, "completed")}>Mark complete</Btn>}
                <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="px-3 py-2 rounded-lg text-xs font-semibold bg-muted inline-flex items-center gap-1">
                  <MessageCircle className="size-3.5"/> Chat
                </Link>
              </div>
            </div>
          );
        })}
      </main>
    </AppShell>
  );
}

function Btn({ onClick, children, variant }: any) {
  return <button onClick={onClick} className={`px-3 py-2 rounded-lg text-xs font-semibold ${variant === "ghost" ? "bg-muted" : "bg-primary text-primary-foreground"}`}>{children}</button>;
}
