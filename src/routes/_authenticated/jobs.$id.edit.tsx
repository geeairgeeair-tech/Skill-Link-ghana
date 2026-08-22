import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { toast } from "sonner";
import { z } from "zod";
import { Camera, Loader2, X } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isJobEditable } from "@/lib/job-editable";
import { ServiceAreaSelect } from "@/components/service-area-select";
import { TIME_WINDOWS, windowInfo, windowHasPassed, type TimeWindowKey } from "@/lib/job-timing";



type MediaItem = { path: string; type: "image" | "video"; previewUrl?: string };

export const Route = createFileRoute("/_authenticated/jobs/$id/edit")({
  component: EditJobPage,
});


const schema = z.object({
  title: z.string().trim().min(4, "Title must be at least 4 characters").max(120),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(2000),
  category_id: z.string().uuid("Pick a category"),
  city: z.string().trim().min(2, "City is required").max(60),
  address: z.string().trim().min(3, "Address is required").max(200),
  service_area_id: z.string().uuid("Select your general service area"),
  service_area: z.string().trim().max(120).optional(),
  region: z.string().trim().max(60).optional(),
  area: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(160).optional(),
  location_instructions: z.string().trim().max(500).optional(),
  budget: z.number().int().min(0).max(1_000_000).optional(),
  urgency: z.enum(["normal","urgent","emergency"]),
  timing_type: z.enum(["asap", "scheduled"]),
  preferred_window: z.enum(["overnight", "morning", "afternoon", "evening", "night"]).optional(),
  preferred_at: z.string().optional(),
  duration_type: z.enum(["single_day", "multi_day"]),
  duration_start_date: z.string().optional(),
  duration_end_date: z.string().optional(),
});

function EditJobPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: job } = useQuery({
    queryKey: ["job-edit", id],
    queryFn: async () => (await supabase.from("job_requests")
      .select("id, title, description, city, service_area, budget, urgency, status, customer_id, category_id, preferred_at, region, area, assigned_worker_id, booking_id, media")
      .eq("id", id).maybeSingle()).data,
  });

  // Load existing photos (private bucket → signed preview URLs).
  useEffect(() => {
    if (!job || media !== null) return;
    const existing = Array.isArray((job as any).media) ? (job as any).media : [];
    const items: MediaItem[] = existing
      .map((m: any) => (typeof m === "string" ? { path: m, type: "image" } : m))
      .filter((m: any) => m && typeof m.path === "string")
      .map((m: any) => ({ path: m.path, type: m.type === "video" ? "video" : "image" }));
    setMedia(items);
    if (!items.length) return;
    supabase.storage.from("job-media").createSignedUrls(items.map((i) => i.path), 60 * 60)
      .then(({ data }) => {
        if (!data) return;
        setMedia((prev) => (prev ?? []).map((it) => {
          const hit = data.find((d: any) => d.path === it.path);
          return hit?.signedUrl ? { ...it, previewUrl: hit.signedUrl } : it;
        }));
      });
  }, [job, media]);

  const onFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    const current = media ?? [];
    if (current.length + files.length > 6) return toast.error("Maximum 6 files per job");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) { toast.error(`${file.name}: only images or short videos`); continue; }
        if (file.size > 25 * 1024 * 1024) { toast.error(`${file.name}: max 25 MB`); continue; }
        const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const previewUrl = URL.createObjectURL(file);
        const { error } = await supabase.storage.from("job-media").upload(path, file, { contentType: file.type });
        if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
        setMedia((m) => [...(m ?? []), { path, type: isVideo ? "video" : "image", previewUrl }]);
      }
    } finally { setUploading(false); }
  };

  const removeMedia = (path: string) => setMedia((m) => (m ?? []).filter((x) => x.path !== path));


  // Exact location is private: only the owner/admin/assigned pro can read it.
  const { data: priv } = useQuery({
    queryKey: ["job-edit-private", id],
    enabled: !!job && !!user,
    queryFn: async () =>
      (((await (supabase.rpc as any)("get_job_request_private", { _id: id })).data as any[]) ?? [])[0] ?? null,
  });
  const addr = (priv as any)?.address as string | null | undefined;

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
      address: prev?.address ?? addr ?? "",
      service_area: prev?.service_area ?? j.service_area ?? "",
      region: prev?.region ?? j.region ?? "",
      area: prev?.area ?? j.area ?? "",
      landmark: prev?.landmark ?? (priv as any)?.landmark ?? "",
      location_instructions: prev?.location_instructions ?? (priv as any)?.location_instructions ?? "",
      budget: prev?.budget ?? (j.budget?.toString() ?? ""),
      urgency: prev?.urgency ?? j.urgency ?? "normal",
      preferred_at: prev?.preferred_at ?? (j.preferred_at ? new Date(j.preferred_at).toISOString().slice(0, 16) : ""),
    }));
  }, [job, addr, priv]);

  if (!job) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (user && (job as any).customer_id !== user.id) return <div className="p-8 text-center">You can't edit this job.</div>;
  if (!isJobEditable((job as any).status))
    return (
      <div className="p-8 text-center">
        This job can no longer be edited — a professional has already been accepted.
      </div>
    );


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
      _media: (media ?? []).map((m) => ({ path: m.path, type: m.type })),
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
        <div>
          <span className="text-xs font-semibold mb-1.5 block">Photos &amp; videos</span>
          <p className="text-[11px] text-muted-foreground mb-2">Up to 6 files. Removing a photo here removes it from the job when you save.</p>
          <div className="grid grid-cols-3 gap-2">
            {(media ?? []).map((m) => (
              <div key={m.path} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                {m.previewUrl ? (
                  m.type === "image"
                    ? <img src={m.previewUrl} alt="Job photo" className="size-full object-cover" />
                    : <video src={m.previewUrl} className="size-full object-cover" muted />
                ) : (
                  <div className="size-full grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
                )}
                <button type="button" onClick={() => removeMedia(m.path)} aria-label="Remove photo"
                  className="absolute top-1 right-1 size-6 grid place-items-center rounded-full bg-black/60 text-white">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {(media ?? []).length < 6 && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-border grid place-items-center cursor-pointer bg-card hover:bg-muted">
                {uploading
                  ? <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Camera className="size-5" /><span className="text-[10px]">Add</span></div>}
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
              </label>
            )}
          </div>
        </div>

        <button type="submit" disabled={busy || uploading} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
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
