import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  title: z.string().trim().min(4, "Title must be at least 4 characters").max(120),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(2000),
  category_id: z.string().uuid("Pick a category"),
  city: z.string().trim().min(2, "City is required").max(60),
  address: z.string().trim().min(3, "Address is required").max(200),
  service_area: z.string().trim().max(120).optional(),
  region: z.string().trim().max(60).optional(),
  area: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(160).optional(),
  location_instructions: z.string().trim().max(500).optional(),
  budget: z.number().int().min(0).max(1_000_000).optional(),
  urgency: z.enum(["normal","urgent","emergency"]),
  preferred_at: z.string().optional(),
});

function EditJobPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);


  const { data: job } = useQuery({
    queryKey: ["job-edit", id],
    queryFn: async () => (await supabase.from("job_requests")
      .select("id, title, description, city, address, service_area, budget, urgency, status, customer_id, category_id, preferred_at, region, area, landmark, location_instructions, assigned_worker_id")
      .eq("id", id).maybeSingle()).data,
  });
  const { data: addr } = useQuery({
    queryKey: ["job-edit-address", id],
    enabled: !!job && !!user,
    queryFn: async () => (await supabase.rpc("get_job_request_address", { _id: id })).data as string | null,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });

  useEffect(() => {
    if (!job) return;
    const j = job as any;
    setForm((prev: any) => ({
      title: prev?.title ?? j.title ?? "",
      description: prev?.description ?? j.description ?? "",
      category_id: prev?.category_id ?? j.category_id ?? "",
      city: prev?.city ?? j.city ?? "",
      address: prev?.address ?? addr ?? j.address ?? "",
      service_area: prev?.service_area ?? j.service_area ?? "",
      region: prev?.region ?? j.region ?? "",
      area: prev?.area ?? j.area ?? "",
      landmark: prev?.landmark ?? j.landmark ?? "",
      location_instructions: prev?.location_instructions ?? j.location_instructions ?? "",
      budget: prev?.budget ?? (j.budget?.toString() ?? ""),
      urgency: prev?.urgency ?? j.urgency ?? "normal",
      preferred_at: prev?.preferred_at ?? (j.preferred_at ? new Date(j.preferred_at).toISOString().slice(0, 16) : ""),
    }));
  }, [job, addr]);

  if (!job) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (user && (job as any).customer_id !== user.id) return <div className="p-8 text-center">You can't edit this job.</div>;
  if ((job as any).status !== "open") return <div className="p-8 text-center">This job can no longer be edited.</div>;
  if ((job as any).assigned_worker_id) return <div className="p-8 text-center">A worker has already been selected — edits are locked.</div>;
  if (!form) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      ...form,
      budget: form.budget ? Number(form.budget) : undefined,
      service_area: form.service_area || undefined,
      region: form.region || undefined,
      area: form.area || undefined,
      landmark: form.landmark || undefined,
      location_instructions: form.location_instructions || undefined,
      preferred_at: form.preferred_at || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.rpc("customer_update_job_request", {
      _job_id: id,
      _title: parsed.data.title,
      _description: parsed.data.description,
      _category_id: parsed.data.category_id,
      _budget: parsed.data.budget ?? null,
      _urgency: parsed.data.urgency,
      _preferred_at: parsed.data.preferred_at ? new Date(parsed.data.preferred_at).toISOString() : null,
      _city: parsed.data.city,
      _address: parsed.data.address,
      _service_area: parsed.data.service_area ?? null,
      _region: parsed.data.region ?? null,
      _area: parsed.data.area ?? null,
      _landmark: parsed.data.landmark ?? null,
      _location_instructions: parsed.data.location_instructions ?? null,
    } as any);
    setBusy(false);
    if (error) {
      console.error("[customer_update_job_request]", error);
      return toast.error(error.message || "Could not save changes.");
    }
    toast.success("Job updated");
    qc.invalidateQueries({ queryKey: ["job-request", id] });
    qc.invalidateQueries({ queryKey: ["job-edit", id] });
    qc.invalidateQueries({ queryKey: ["my-job-posts"] });
    qc.invalidateQueries({ queryKey: ["worker-open-jobs"] });
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

      <form onSubmit={submit} noValidate className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <F label="Title *"><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input" /></F>
        <F label="Description *"><textarea rows={4} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input resize-none" /></F>
        <F label="Category *">
          <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="input">
            <option value="">Pick a category…</option>
            {(categories ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="City *"><input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="input" /></F>
          <F label="Service area"><input value={form.service_area} onChange={e => setForm({...form, service_area: e.target.value})} className="input" /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Region"><input value={form.region} onChange={e => setForm({...form, region: e.target.value})} className="input" /></F>
          <F label="Area"><input value={form.area} onChange={e => setForm({...form, area: e.target.value})} className="input" /></F>
        </div>
        <F label="Landmark"><input value={form.landmark} onChange={e => setForm({...form, landmark: e.target.value})} className="input" placeholder="e.g. Near Total filling station" /></F>
        <F label="Address *"><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input" /></F>
        <F label="Location instructions"><textarea rows={2} value={form.location_instructions} onChange={e => setForm({...form, location_instructions: e.target.value})} className="input resize-none" placeholder="Gate colour, how to find it, parking…" /></F>
        <F label="Budget (GH₵)"><input value={form.budget} onChange={e => setForm({...form, budget: e.target.value.replace(/\D/g,'')})} inputMode="numeric" className="input" /></F>
        <F label="Preferred date/time"><input type="datetime-local" value={form.preferred_at} onChange={e => setForm({...form, preferred_at: e.target.value})} className="input" /></F>
        <F label="Urgency *">
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
