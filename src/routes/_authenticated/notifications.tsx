import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { Bell, CheckCheck, Calendar, MessageCircle, Briefcase, ShieldCheck, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const ICONS: Record<string, any> = {
  booking_request: Calendar,
  booking_accepted: Calendar,
  booking_declined: XCircle,
  chat_message: MessageCircle,
  application_received: Briefcase,
  application_accepted: Briefcase,
  application_rejected: Briefcase,
  verification_approved: ShieldCheck,
  verification_rejected: ShieldCheck,
};

function targetFor(n: any): { to: string; params?: any } | null {
  const d = n.data ?? {};
  if (d.booking_id) {
    if (n.type === "chat_message") return { to: "/chat/$bookingId", params: { bookingId: d.booking_id } };
    return { to: "/bookings" };
  }
  if (d.job_id) return { to: "/jobs/$id", params: { id: d.job_id } };
  if (n.type?.startsWith("verification_")) return { to: "/worker/dashboard" };
  return null;
}

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("notifications")
      .select("*").eq("user_id", user!.id)
      .order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`notif:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user!.id] });
    qc.invalidateQueries({ queryKey: ["notif-unread", user!.id] });
  };

  const markAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("user_id", user!.id).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications", user!.id] });
    qc.invalidateQueries({ queryKey: ["notif-unread", user!.id] });
  };

  const onOpen = async (n: any) => {
    if (!n.read_at) await markRead(n.id);
    const t = targetFor(n);
    if (t) navigate(t as any);
  };

  const list = data ?? [];
  const unread = list.filter((n: any) => !n.read_at);
  const read = list.filter((n: any) => n.read_at);

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold inline-flex items-center gap-2"><Bell className="size-5"/> Notifications</h1>
            <p className="text-sm opacity-80">{unread.length} unread</p>
          </div>
          {unread.length > 0 && (
            <button onClick={markAll} className="text-xs font-semibold bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 inline-flex items-center gap-1">
              <CheckCheck className="size-3.5"/> Mark all read
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-2">
        {list.length === 0 && (
          <div className="rounded-2xl bg-card border border-border p-8 text-center">
            <Bell className="size-8 mx-auto text-muted-foreground mb-2"/>
            <p className="text-sm text-muted-foreground">You're all caught up.</p>
          </div>
        )}
        {unread.length > 0 && <p className="text-[11px] uppercase font-bold text-muted-foreground pt-2">New</p>}
        {unread.map((n: any) => <Row key={n.id} n={n} onOpen={onOpen} />)}
        {read.length > 0 && <p className="text-[11px] uppercase font-bold text-muted-foreground pt-4">Earlier</p>}
        {read.map((n: any) => <Row key={n.id} n={n} onOpen={onOpen} />)}
      </main>
    </AppShell>
  );
}

function Row({ n, onOpen }: any) {
  const Icon = ICONS[n.type] ?? Bell;
  const unread = !n.read_at;
  return (
    <button
      onClick={() => onOpen(n)}
      className={`w-full text-left rounded-2xl border p-3 flex gap-3 transition-colors ${unread ? "bg-primary-soft/40 border-primary/20" : "bg-card border-border"}`}
    >
      <div className={`size-9 shrink-0 rounded-full grid place-items-center ${unread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        <Icon className="size-4"/>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm truncate">{n.title}</p>
          <span className="text-[10px] text-muted-foreground shrink-0">{new Date(n.created_at).toLocaleDateString()}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
      </div>
      {unread && <span className="size-2 rounded-full bg-primary self-center shrink-0"/>}
    </button>
  );
}
