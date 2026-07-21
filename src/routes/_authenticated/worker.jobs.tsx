import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircle, MapPin, Calendar, Wallet, AlertTriangle, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/jobs")({
  component: JobsPage,
});

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type TabKey = typeof TABS[number]["key"];

const DECLINE_REASONS: { code: string; label: string }[] = [
  { code: "schedule_conflict", label: "Schedule conflict" },
  { code: "too_far", label: "Too far from my service area" },
  { code: "budget_low", label: "Budget is too low" },
  { code: "no_equipment", label: "I don't have the required equipment" },
  { code: "unavailable", label: "I'm currently unavailable" },
  { code: "unclear_details", label: "Job details are unclear" },
  { code: "safety_concern", label: "Safety concern" },
  { code: "wrong_category", label: "Wrong category or service" },
  { code: "other", label: "Other" },
];

function matchesTab(status: string, tab: TabKey) {
  if (tab === "accepted") return ["accepted","on_the_way","arrived","in_progress","worker_on_the_way","work_started","worker_marked_complete"].includes(status);
  return status === tab;
}

function JobsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("pending");
  const [mediaByBooking, setMediaByBooking] = useState<Record<string, string[]>>({});
  const [declineFor, setDeclineFor] = useState<string | null>(null);

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
    const c: Record<TabKey, number> = { pending: 0, accepted: 0, completed: 0, declined: 0, cancelled: 0 };
    (data ?? []).forEach((b: any) => {
      TABS.forEach(t => { if (matchesTab(b.status, t.key)) c[t.key]++; });
    });
    return c;
  }, [data]);

  const visible = (data ?? []).filter((b: any) => matchesTab(b.status, tab));

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
          const declined = b.status === "declined" || b.status === "cancelled";
          const declineLabel = DECLINE_REASONS.find(r => r.code === b.decline_reason)?.label;
          return (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="size-11 shrink-0 rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-sm">
                  {b.profiles?.avatar_url
                    ? <img src={b.profiles.avatar_url} alt="" className="size-full object-cover"/>
                    : (b.profiles?.full_name?.[0]?.toUpperCase() ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{b.profiles?.full_name ?? "Skill Link Customer"}</p>
                      <p className="text-xs text-muted-foreground">{b.categories?.name ?? "Service"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${
                        declined ? "bg-destructive/15 text-destructive"
                        : b.status === "pending" ? "bg-warning/20 text-warning-foreground"
                        : b.status === "completed" ? "bg-success/15 text-success"
                        : "bg-primary-soft text-primary"
                      }`}>{b.status.replace(/_/g," ")}</span>
                      {b.urgency && b.urgency !== "normal" && !declined && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-warning-foreground bg-warning/20 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="size-3"/>{b.urgency}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm mt-2">{b.description}</p>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                {b.scheduled_at && <p className="inline-flex items-center gap-1"><Calendar className="size-3"/>{new Date(b.scheduled_at).toLocaleString()}</p>}
                {b.service_area && <p className="inline-flex items-center gap-1"><MapPin className="size-3"/>{b.service_area}</p>}
                {b.budget && <p className="inline-flex items-center gap-1"><Wallet className="size-3"/>Budget GH₵{b.budget}</p>}
                {b.status !== "pending" && !declined && b.address && <p className="text-foreground/80">📍 {b.address}</p>}
              </div>

              {declined && declineLabel && (
                <div className="mt-3 rounded-xl bg-destructive/5 border border-destructive/20 p-2.5 text-xs">
                  <p className="inline-flex items-center gap-1 font-semibold text-destructive"><XCircle className="size-3.5"/> Reason: {declineLabel}</p>
                  {b.decline_note && <p className="text-muted-foreground mt-1">"{b.decline_note}"</p>}
                  {b.declined_at && <p className="text-[10px] text-muted-foreground mt-1">{new Date(b.declined_at).toLocaleString()}</p>}
                </div>
              )}

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
                  <button type="button" onClick={() => updateStatus(b.id, "accepted")} className="px-3 py-2 rounded-lg text-xs font-semibold bg-success text-success-foreground">Accept</button>
                  <button type="button" onClick={() => setDeclineFor(b.id)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-destructive text-destructive-foreground">Decline</button>
                </>}
                {!declined && b.status === "accepted" && <Btn onClick={() => updateStatus(b.id, "on_the_way")}>On the way</Btn>}
                {!declined && b.status === "on_the_way" && <Btn onClick={() => updateStatus(b.id, "arrived")}>Mark arrived</Btn>}
                {!declined && b.status === "arrived" && <Btn onClick={() => updateStatus(b.id, "in_progress")}>Start job</Btn>}
                {!declined && b.status === "in_progress" && <Btn onClick={() => updateStatus(b.id, "completed")}>Mark complete</Btn>}
                {!declined && (
                  <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="px-3 py-2 rounded-lg text-xs font-semibold bg-muted inline-flex items-center gap-1">
                    <MessageCircle className="size-3.5"/> Chat
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {declineFor && (
        <DeclineModal
          bookingId={declineFor}
          onClose={() => setDeclineFor(null)}
          onDone={() => { setDeclineFor(null); qc.invalidateQueries({ queryKey: ["worker-jobs"] }); }}
        />
      )}
    </AppShell>
  );
}

function Btn({ onClick, children }: any) {
  return <button type="button" onClick={onClick} className="px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">{children}</button>;
}

function DeclineModal({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (reason === "other" && !note.trim()) return toast.error("Please explain your reason");
    setSaving(true);
    const { error } = await supabase.rpc("worker_decline_booking", {
      _booking_id: bookingId, _reason_code: reason, _reason_note: note.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Booking declined");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4">
      <div className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display font-bold text-lg">Decline this booking</h3>
        <p className="text-xs text-muted-foreground mt-1">Choose a reason. The customer will see this.</p>
        <div className="mt-4 space-y-2">
          {DECLINE_REASONS.map(r => (
            <label key={r.code} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${reason === r.code ? "border-primary bg-primary-soft/40" : "border-border"}`}>
              <input type="radio" name="reason" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} className="accent-primary"/>
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
        {reason === "other" && (
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Please explain (required)…"
            className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[80px]"
          />
        )}
        {reason && reason !== "other" && (
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a note (optional)…"
            className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[60px]"
          />
        )}
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !reason} className="px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground disabled:opacity-60">
            {saving ? "Declining…" : "Confirm decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
