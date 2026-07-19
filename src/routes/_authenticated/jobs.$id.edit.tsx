import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/$id/edit")({
  component: EditJobPage,
});

const schema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(2000),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().min(3).max(200),
  service_area: z.string().trim().max(120).optional(),
  budget: z.number().int().min(0).max(1_000_000).optional(),
  urgency: z.enum(["normal","urgent","emergency"]),
});

function EditJobPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data: job } = useQuery({
    queryKey: ["job-edit", id],
    queryFn: async () => (await supabase.from("job_requests")
      .select("id, title, description, city, address, service_area, budget, urgency, status, customer_id")
      .eq("id", id).maybeSingle()).data,
  });
  const { data: addr } = useQuery({
    queryKey: ["job-edit-address", id],
    enabled: !!job && !!user,
    queryFn: async () => (await supabase.rpc("get_job_request_address", { _id: id })).data as string | null,
  });

  useEffect(() => {
    if (job && !form) {
      setForm({
        title: (job as any).title ?? "",
        description: (job as any).description ?? "",
        city: (job as any).city ?? "",
        address: addr ?? (job as any).address ?? "",
        service_area: (job as any).service_area ?? "",
        budget: (job as any).budget?.toString() ?? "",
        urgency: (job as any).urgency ?? "normal",
      });
    }
  }, [job, addr]);

  if (!job) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (user && (job as any).customer_id !== user.id) return <div className="p-8 text-center">You can't edit this job.</div>;
  if ((job as any).status !== "open") return <div className="p-8 text-center">This job can no longer be edited.</div>;
  if (!form) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      ...form,
      budget: form.budget ? Number(form.budget) : undefined,
      service_area: form.service_area || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("job_requests").update(parsed.data as any).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Job updated");
    navigate({ to: "/jobs/$id", params: { id } });
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <div className="mb-3"><BackButton fallback="/jobs/mine" /></div>
          <h1 className="font-display text-2xl font-bold">Edit job</h1>
        </div>
      </header>

      <form onSubmit={submit} className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <F label="Title"><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input" required /></F>
        <F label="Description"><textarea rows={4} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input resize-none" required /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="City"><input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="input" required /></F>
          <F label="Area"><input value={form.service_area} onChange={e => setForm({...form, service_area: e.target.value})} className="input" /></F>
        </div>
        <F label="Address"><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input" required /></F>
        <F label="Budget (GH₵)"><input value={form.budget} onChange={e => setForm({...form, budget: e.target.value.replace(/\D/g,'')})} inputMode="numeric" className="input" /></F>
        <F label="Urgency">
          <select value={form.urgency} onChange={e => setForm({...form, urgency: e.target.value})} className="input">
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </F>
        <button type="submit" disabled={busy} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <style>{`.input{width:100%;padding:0.75rem 0.875rem;border-radius:0.75rem;border:1px solid hsl(var(--input));background:hsl(var(--card));font-size:0.875rem;outline:none;color:hsl(var(--foreground))}.input:focus{box-shadow:0 0 0 2px hsl(var(--ring)/0.4)}`}</style>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-semibold mb-1.5 block">{label}</span>{children}</label>;
}
