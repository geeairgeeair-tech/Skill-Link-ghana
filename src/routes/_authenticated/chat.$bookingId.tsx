import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Lock, ClipboardList, Paperclip, Loader2, Check, CheckCheck } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage } from "@/components/image-upload";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/chat/$bookingId")({
  component: ChatPage,
});

const CLOSED_STATUSES = ["completed", "closed", "customer_confirmed_complete", "cancelled", "declined"];

function rankLabel(rank: number | null) {
  if (rank == null) return null;
  return rank === 1 ? "Primary" : rank === 2 ? "Profession 2" : rank === 3 ? "Profession 3" : `Profession ${rank}`;
}

function ChatPage() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["chat-booking", bookingId],
    queryFn: async () => {
      const { data: b } = await supabase.from("bookings")
        .select("id, customer_id, worker_id, description, status, category_id, categories(name)")
        .eq("id", bookingId).maybeSingle();
      if (!b) return null;
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", [b.customer_id, b.worker_id]);
      const map: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      const { data: professions } = await supabase.from("worker_professions")
        .select("category_id, is_primary, created_at")
        .eq("user_id", b.worker_id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      const idx = (professions ?? []).findIndex((p: any) => p.category_id === b.category_id);
      return { ...b, customer: map[b.customer_id] ?? null, worker: map[b.worker_id] ?? null, professionRank: idx >= 0 ? idx + 1 : null } as any;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["chat-messages", bookingId],
    queryFn: async () => (await supabase.from("messages").select("*").eq("booking_id", bookingId).order("created_at",{ascending:true})).data ?? [],
  });

  // An open return request reopens the conversation even after completion.
  const { data: openReturn } = useQuery({
    queryKey: ["chat-return", bookingId],
    queryFn: async () => {
      const { data } = await supabase.from("return_requests").select("id, status")
        .eq("booking_id", bookingId)
        .in("status", ["pending", "info_requested", "accepted", "scheduled"])
        .maybeSingle();
      return data ?? null;
    },
  });

  /** Merge a row into the cache, replacing any optimistic twin and never duplicating. */
  const mergeMessage = (row: any) => {
    qc.setQueryData(["chat-messages", bookingId], (old: any[] | undefined) => {
      const list = old ?? [];
      if (list.some((m) => m.id === row.id)) {
        return list.map((m) => (m.id === row.id ? { ...m, ...row } : m));
      }
      // drop the optimistic placeholder this row confirms
      const withoutTemp = list.filter(
        (m) =>
          !(
            String(m.id).startsWith("temp-") &&
            m.sender_id === row.sender_id &&
            m.content === row.content
          ),
      );
      return [...withoutTemp, row].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  };
  const mergeRef = useRef(mergeMessage);
  mergeRef.current = mergeMessage;

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`chat:${bookingId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `booking_id=eq.${bookingId}` },
        (payload) => mergeRef.current(payload.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `booking_id=eq.${bookingId}` },
        (payload) => mergeRef.current(payload.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        () => qc.invalidateQueries({ queryKey: ["chat-booking", bookingId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "return_requests", filter: `booking_id=eq.${bookingId}` },
        () => qc.invalidateQueries({ queryKey: ["chat-return", bookingId] }))
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          // resync anything missed while disconnected
          qc.invalidateQueries({ queryKey: ["chat-messages", bookingId] });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          retry = setTimeout(() => {
            if (!cancelled) supabase.realtime.connect();
          }, 2000);
        }
      });

    // Recover instantly when the tab/network comes back.
    const onFocus = () => qc.invalidateQueries({ queryKey: ["chat-messages", bookingId] });
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      supabase.removeChannel(channel);
    };
  }, [bookingId, qc]);


  useEffect(() => {
    if (!user) return;
    supabase.rpc("mark_messages_read", { _booking_id: bookingId } as any).then(() => {
      qc.invalidateQueries({ queryKey: ["chat-messages", bookingId] });
      qc.invalidateQueries({ queryKey: ["worker-unread-msgs"] });
    });
    supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("type", "chat_message").is("read_at", null)
      .contains("data", { booking_id: bookingId })
      .then(() => qc.invalidateQueries({ queryKey: ["unread-notifications"] }));
  }, [bookingId, user?.id, messages?.length, qc]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages?.length]);

  const readOnly = !!booking && CLOSED_STATUSES.includes((booking as any).status) && !openReturn;

  /** Optimistically append so the sender sees the message instantly; the inserted row replaces it. */
  const appendOptimistic = (msg: any) => {
    qc.setQueryData(["chat-messages", bookingId], (old: any[] | undefined) => [...(old ?? []), msg]);
  };
  const dropTemp = (tempId: string) =>
    qc.setQueryData(["chat-messages", bookingId], (old: any[] | undefined) =>
      (old ?? []).filter((m) => m.id !== tempId));

  const send = async () => {
    const content = text.trim();
    if (!content || !user || readOnly) return;
    setText("");
    const tempId = `temp-${Date.now()}`;
    appendOptimistic({ id: tempId, booking_id: bookingId, sender_id: user.id, content, created_at: new Date().toISOString(), read_at: null, attachment_url: null });
    const { data, error } = await supabase
      .from("messages")
      .insert({ booking_id: bookingId, sender_id: user.id, content })
      .select("*")
      .single();
    if (error) {
      dropTemp(tempId);
      toast.error(error.message);
      setText(content);
      return;
    }
    dropTemp(tempId);
    mergeMessage(data);
  };

  const sendAttachment = async (file: File) => {
    if (!user || readOnly) return;
    setUploading(true);
    const tempId = `temp-${Date.now()}`;
    try {
      const url = await uploadImage("job-media", user.id, file, "chat");
      appendOptimistic({ id: tempId, booking_id: bookingId, sender_id: user.id, content: "📎 Photo", attachment_url: url, created_at: new Date().toISOString(), read_at: null });
      const { data, error } = await supabase.from("messages").insert({
        booking_id: bookingId, sender_id: user.id, content: "📎 Photo", attachment_url: url,
      } as any).select("*").single();
      if (error) throw error;
      dropTemp(tempId);
      mergeMessage(data);
    } catch (e: any) {
      dropTemp(tempId);
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };



  const other = booking ? (user?.id === (booking as any).customer_id ? (booking as any).worker?.full_name : (booking as any).customer?.full_name) : "Chat";
  const rank = rankLabel((booking as any)?.professionRank ?? null);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <BackButton fallback="/bookings" label="" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{other ?? "Chat"}</p>
            <p className="text-xs text-muted-foreground truncate">
              Profession: {(booking as any)?.categories?.name ?? "Service"}
              {rank ? ` · ${rank}` : ""}
              {(booking as any)?.status ? ` · ${String((booking as any).status).replace(/_/g, " ")}` : ""}
            </p>

          </div>
          <Link to="/bookings/$bookingId" params={{ bookingId }} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <ClipboardList className="size-4" /> Booking
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-3 space-y-2">
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        )}
        {!isLoading && (messages ?? []).length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">No messages yet. Say hello 👋</p>
        )}
        {(messages ?? []).map((m: any) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                {m.attachment_url && (
                  <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                    <img src={m.attachment_url} alt="Attachment" className="mb-1 max-h-56 rounded-xl object-cover" />
                  </a>
                )}
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`text-[10px] mt-0.5 inline-flex items-center gap-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {mine && (m.read_at ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </main>

      {readOnly ? (
        <div className="sticky bottom-0 bg-muted/80 backdrop-blur border-t border-border p-4">
          <p className="mx-auto max-w-2xl text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
            <Lock className="size-4" /> This booking is completed. Chat is read-only.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border p-3"
        >
          {openReturn && (
            <p className="mx-auto max-w-2xl text-[11px] text-muted-foreground mb-2 text-center">
              Chat reopened for a return job request.
            </p>
          )}
          <div className="mx-auto max-w-2xl flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              aria-label="Attach photo"
              className="size-12 shrink-0 grid place-items-center rounded-full border border-input text-muted-foreground disabled:opacity-50"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 min-w-0 px-4 py-3 rounded-full border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button type="submit" disabled={!text.trim()} className="size-12 shrink-0 grid place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
              <Send className="size-4"/>
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
