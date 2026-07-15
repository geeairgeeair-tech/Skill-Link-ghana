import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/chat/$bookingId")({
  component: ChatPage,
});

function ChatPage() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data: booking } = useQuery({
    queryKey: ["chat-booking", bookingId],
    queryFn: async () => (await supabase.from("bookings")
      .select("id, customer_id, worker_id, description, customer:profiles!bookings_customer_id_fkey(full_name), worker:profiles!bookings_worker_id_fkey(full_name)")
      .eq("id", bookingId).maybeSingle()).data,
  });

  const { data: messages } = useQuery({
    queryKey: ["chat-messages", bookingId],
    queryFn: async () => (await supabase.from("messages").select("*").eq("booking_id", bookingId).order("created_at",{ascending:true})).data ?? [],
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${bookingId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `booking_id=eq.${bookingId}` },
        () => qc.invalidateQueries({ queryKey: ["chat-messages", bookingId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingId, qc]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages?.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || !user) return;
    setText("");
    const { error } = await supabase.from("messages").insert({ booking_id: bookingId, sender_id: user.id, content });
    if (error) { toast.error(error.message); setText(content); }
  };

  const other = booking ? (user?.id === (booking as any).customer_id ? (booking as any).worker?.full_name : (booking as any).customer?.full_name) : "Chat";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3">
          <BackButton fallback="/bookings" label="" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{other ?? "Chat"}</p>
            <p className="text-xs text-muted-foreground truncate">{(booking as any)?.description ?? "Booking chat"}</p>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-md w-full px-4 py-3 space-y-2">
        {(messages ?? []).length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">No messages yet. Say hello 👋</p>
        )}
        {(messages ?? []).map((m: any) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`text-[10px] mt-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </main>
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border p-3"
      >
        <div className="mx-auto max-w-md flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 px-4 py-3 rounded-full border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button type="submit" disabled={!text.trim()} className="size-12 grid place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
            <Send className="size-4"/>
          </button>
        </div>
      </form>
    </div>
  );
}
