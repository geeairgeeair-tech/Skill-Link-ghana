import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/book/$workerId")({
  component: BookPage,
});

function BookPage() {
  const { workerId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: w } = useQuery({
    queryKey: ["book-worker", workerId],
    queryFn: async () => (await supabase.from("worker_profiles").select("*, profiles!worker_profiles_user_id_fkey(full_name), categories(name,id)").eq("user_id", workerId).maybeSingle()).data,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const estimated = ((w as any)?.callout_fee ?? 0) + ((w as any)?.hourly_rate ?? 0);
    const { error } = await supabase.from("bookings").insert({
      customer_id: user.id,
      worker_id: workerId,
      category_id: (w as any)?.category_id,
      description, address,
      scheduled_at: scheduledAt || null,
      estimated_cost: estimated,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Booking sent! The pro will respond shortly.");
    navigate({ to: "/bookings" });
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="px-5 pt-5 pb-4">
        <Link to="/workers/$id" params={{ id: workerId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4"/> Back</Link>
        <h1 className="font-display text-2xl font-bold mt-2">Book {(w as any)?.profiles?.full_name ?? "Pro"}</h1>
        <p className="text-sm text-muted-foreground">{(w as any)?.categories?.name}</p>
      </header>
      <form onSubmit={submit} className="mx-auto max-w-md px-5 space-y-3">
        <Field label="Describe the job">
          <textarea required value={description} onChange={(e)=>setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="What needs fixing?" />
        </Field>
        <Field label="Job location / address">
          <input required value={address} onChange={(e)=>setAddress(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="e.g. East Legon, House #12" />
        </Field>
        <Field label="When?">
          <input type="datetime-local" value={scheduledAt} onChange={(e)=>setScheduledAt(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
        </Field>
        <div className="rounded-xl bg-primary-soft p-4">
          <p className="text-xs text-muted-foreground">Estimated cost</p>
          <p className="font-display text-2xl font-bold text-primary">GH₵{((w as any)?.callout_fee ?? 0) + ((w as any)?.hourly_rate ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Final price agreed with worker after job inspection.</p>
        </div>
        <button disabled={loading} className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50">
          {loading ? "Sending…" : "Send booking request"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="block"><p className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">{label}</p>{children}</label>;
}
