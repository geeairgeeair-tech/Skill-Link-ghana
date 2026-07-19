import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, Star, MessageCircle, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bookings")({
  component: BookingsPage,
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  accepted: "bg-primary-soft text-primary",
  on_the_way: "bg-primary-soft text-primary",
  in_progress: "bg-primary-soft text-primary",
  completed: "bg-success/20 text-success-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

function BookingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase
      .from("bookings")
      .select("*, categories(name), profiles!bookings_worker_id_fkey(full_name), reviews(id, rating, comment)")
      .eq("customer_id", user!.id)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const [open, setOpen] = useState<string | null>(null);

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3 mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold">My bookings</h1>
      </header>
      <main className="mx-auto max-w-md px-5 space-y-3">
        {(data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Calendar className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
            <Link to="/workers" className="mt-3 inline-block text-primary font-semibold text-sm">Find a pro →</Link>
          </div>
        ) : (data ?? []).map((b: any) => {
          const hasReview = (b.reviews ?? []).length > 0;
          return (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{b.profiles?.full_name ?? "Worker"}</p>
                <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status]}`}>
                  {b.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{b.categories?.name}</p>
              <p className="text-sm mt-2 line-clamp-2">{b.description}</p>
              {b.scheduled_at && <p className="text-xs text-muted-foreground mt-2">📅 {new Date(b.scheduled_at).toLocaleString()}</p>}
              {b.estimated_cost ? <p className="text-sm font-semibold text-primary mt-1">~ GH₵{b.estimated_cost}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/chat/$bookingId" params={{ bookingId: b.id }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold">
                  <MessageCircle className="size-3" /> Chat
                </Link>
                {b.status === "completed" && !hasReview && (
                  <button onClick={() => setOpen(b.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gold text-gold-foreground text-xs font-semibold">
                    <Star className="size-3" /> Leave review
                  </button>
                )}
                {hasReview && (
                  <span className="inline-flex items-center gap-1 text-xs text-success font-semibold">
                    <Star className="size-3 fill-current" /> Reviewed · {b.reviews[0].rating}/5
                  </span>
                )}
              </div>
              {open === b.id && (
                <ReviewForm
                  bookingId={b.id}
                  workerId={b.worker_id}
                  customerId={user!.id}
                  onClose={() => setOpen(null)}
                  onDone={() => { setOpen(null); qc.invalidateQueries({ queryKey: ["my-bookings"] }); }}
                />
              )}
            </div>
          );
        })}
      </main>
    </AppShell>
  );
}

function ReviewForm({ bookingId, workerId, customerId, onClose, onDone }: { bookingId: string; workerId: string; customerId: string; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.from("reviews").insert({
      booking_id: bookingId, worker_id: workerId, customer_id: customerId, rating, comment: comment.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Review posted — thank you!");
    onDone();
  };
  return (
    <div className="mt-3 rounded-xl border border-border p-3 bg-background">
      <p className="text-sm font-semibold mb-2">How was your experience?</p>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            <Star className={`size-7 ${n <= rating ? "fill-gold text-gold" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Share a few words about the job (optional)…"
        className="w-full text-sm rounded-lg border border-input bg-card p-2 min-h-[70px]"
      />
      <div className="flex gap-2 mt-2 justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted">Cancel</button>
        <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-60">
          {saving ? "Posting…" : "Post review"}
        </button>
      </div>
    </div>
  );
}
