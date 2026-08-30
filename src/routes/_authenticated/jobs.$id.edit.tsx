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
import { serviceAreaCity } from "@/lib/service-areas";
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
      .select("id, title, description, city, service_area, service_area_id, budget, urgency, status, customer_id, category_id, preferred_at, preferred_window, timing_type, duration_type, duration_start_date, duration_end_date, region, area, assigned_worker_id, booking_id, media")
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
    // Legacy fallback: jobs posted before canonical timing/duration fields existed.
    const legacyTiming: "asap" | "scheduled" = j.timing_type === "scheduled" || j.timing_type === "asap"
      ? j.timing_type
      : j.preferred_at ? "scheduled" : "asap";
    const legacyDate = j.preferred_at ? new Date(j.preferred_at).toISOString().slice(0, 10) : "";
    setForm((prev: any) => ({
      title: prev?.title ?? j.title ?? "",
      description: prev?.description ?? j.description ?? "",
      category_id: prev?.category_id ?? j.category_id ?? "",
      city: prev?.city ?? j.city ?? "",
      address: prev?.address ?? addr ?? "",
      service_area: prev?.service_area ?? j.service_area ?? "",
      service_area_id: prev?.service_area_id ?? j.service_area_id ?? "",
      region: prev?.region ?? j.region ?? "",
      area: prev?.area ?? j.area ?? "",
      landmark: prev?.landmark ?? (priv as any)?.landmark ?? "",
      location_instructions: prev?.location_instructions ?? (priv as any)?.location_instructions ?? "",
      budget: prev?.budget ?? (j.budget?.toString() ?? ""),
      urgency: prev?.urgency ?? j.urgency ?? "normal",
      timing_type: prev?.timing_type ?? legacyTiming,
      preferred_date: prev?.preferred_date ?? legacyDate,
      preferred_window: prev?.preferred_window ?? (j.preferred_window ?? ""),
      duration_type: prev?.duration_type ?? (j.duration_type === "multi_day" ? "multi_day" : "single_day"),
      duration_end_date: prev?.duration_end_date ?? (j.duration_end_date ?? ""),
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

  const today = new Date().toISOString().slice(0, 10);
  // Start date is derived, never entered twice: scheduled date, or today for ASAP,
  // falling back to whatever the job already had.
  const durationStart = form.timing_type === "scheduled"
    ? (form.preferred_date || (job as any).duration_start_date || today)
    : ((job as any).duration_start_date && (job as any).duration_start_date < today
        ? (job as any).duration_start_date
        : today);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const scheduled = form.timing_type === "scheduled";
    if (scheduled) {
      if (!form.preferred_date) return toast.error("Pick a preferred date");
      if (!form.preferred_window) return toast.error("Pick a time window");
      if (windowHasPassed(form.preferred_date, form.preferred_window)) return toast.error("That date and time window has already passed");
    }
    if (form.duration_type === "multi_day") {
      if (!durationStart) return toast.error("Pick a start date");
      if (!form.duration_end_date) return toast.error("Pick an end date");
      if (form.duration_end_date < durationStart) return toast.error("End date cannot be before the start date");
    }

    let preferredAtIso: string | undefined;
    const w = scheduled ? windowInfo(form.preferred_window as TimeWindowKey) : null;
    if (scheduled && form.preferred_date && w) {
      const d = new Date(`${form.preferred_date}T00:00:00`);
      d.setHours(w.startHour, 0, 0, 0);
      preferredAtIso = d.toISOString();
    }

    const parsed = schema.safeParse({
      ...form,
      budget: form.budget ? Number(form.budget) : undefined,
      service_area: form.service_area || undefined,
      service_area_id: form.service_area_id || undefined,
      region: form.region || undefined,
      area: form.area || undefined,
      landmark: form.landmark || undefined,
      location_instructions: form.location_instructions || undefined,
      preferred_window: scheduled && form.preferred_window ? form.preferred_window : undefined,
      preferred_at: preferredAtIso,
      duration_start_date: form.duration_type === "multi_day" ? durationStart : undefined,
      duration_end_date: form.duration_type === "multi_day" ? form.duration_end_date : undefined,
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
      _preferred_at: parsed.data.preferred_at ?? null,
      _city: parsed.data.city,
      _address: parsed.data.address,
      _service_area: parsed.data.service_area ?? null,
      _region: parsed.data.region ?? null,
      _area: parsed.data.area ?? null,
      _landmark: parsed.data.landmark ?? null,
      _location_instructions: parsed.data.location_instructions ?? null,
      _media: (media ?? []).map((m) => ({ path: m.path, type: m.type })),
    } as any);

    if (error) {
      setBusy(false);
      console.error("[customer_update_job_request]", error);
      return toast.error(error.message || "Could not save changes.");
    }

    // Canonical scheduling/service-area columns (owner-scoped by RLS).
    const { error: canonErr } = await supabase.from("job_requests").update({
      service_area_id: parsed.data.service_area_id,
      timing_type: parsed.data.timing_type,
      preferred_window: parsed.data.preferred_window ?? null,
      duration_type: parsed.data.duration_type,
      duration_start_date: parsed.data.duration_type === "multi_day" ? durationStart : null,
      duration_end_date: parsed.data.duration_type === "multi_day" ? (parsed.data.duration_end_date ?? null) : null,
    } as any).eq("id", id);

    setBusy(false);
    if (canonErr) {
      console.error("[job_requests canonical update]", canonErr);
      return toast.error(canonErr.message || "Could not save scheduling details.");
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
        <F label="General service area *">
          <ServiceAreaSelect
            value={form.service_area_id || null}
            onChange={(sid, a) => setForm({ ...form, service_area_id: sid ?? "", service_area: a?.name ?? "", city: serviceAreaCity(a) || form.city })}
          />
        </F>
        <F label="City *"><input value={form.city} readOnly className="input opacity-70" /></F>
        <F label="Exact service address *"><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input" placeholder="House / street / landmark" /></F>
        <F label="Budget (GH₵)"><input value={form.budget} onChange={e => setForm({...form, budget: e.target.value.replace(/\D/g,'')})} inputMode="numeric" className="input" /></F>

        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <p className="text-sm font-semibold">When do you need this done?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm({...form, timing_type: "asap"})}
              className={`h-12 rounded-xl border text-sm font-semibold ${form.timing_type === "asap" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              ⚡ ASAP
            </button>
            <button type="button" onClick={() => setForm({...form, timing_type: "scheduled"})}
              className={`h-12 rounded-xl border text-sm font-semibold ${form.timing_type === "scheduled" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              📅 Schedule
            </button>
          </div>
          {form.timing_type === "asap" ? (
            <p className="text-xs text-muted-foreground">Workers will see this job marked ⚡ ASAP — as soon as possible.</p>
          ) : (
            <>
              <F label="Preferred date">
                <input type="date" value={form.preferred_date} min={today}
                  onChange={e => setForm({...form, preferred_date: e.target.value})} className="input" />
              </F>
              <F label="Time window">
                <div className="grid grid-cols-2 gap-2">
                  {TIME_WINDOWS.map(w => {
                    const passed = !!form.preferred_date && windowHasPassed(form.preferred_date, w.key);
                    return (
                      <button key={w.key} type="button" disabled={passed}
                        onClick={() => setForm({...form, preferred_window: w.key})}
                        className={`h-11 rounded-xl border text-xs font-semibold px-2 disabled:opacity-40 ${form.preferred_window === w.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
                        {w.label} <span className="opacity-70">({w.range})</span>
                      </button>
                    );
                  })}
                </div>
              </F>
            </>
          )}

          <F label="How long will you need the Professional?">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm({...form, duration_type: "single_day", duration_end_date: ""})}
                className={`h-12 rounded-xl border text-xs font-semibold px-2 ${form.duration_type === "single_day" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
                ⏱ One day or less
              </button>
              <button type="button" onClick={() => setForm({...form, duration_type: "multi_day"})}
                className={`h-12 rounded-xl border text-xs font-semibold px-2 ${form.duration_type === "multi_day" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
                📆 More than one day
              </button>
            </div>
          </F>
          {form.duration_type === "multi_day" && (
            <>
              <F label="Start date">
                <input type="date" value={durationStart} readOnly disabled className="input opacity-70" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {form.timing_type === "scheduled" ? "Uses your scheduled date above." : "ASAP jobs start from today."}
                </p>
              </F>
              <F label="Expected end date">
                <input type="date" value={form.duration_end_date} min={durationStart}
                  onChange={e => setForm({...form, duration_end_date: e.target.value})} className="input" />
              </F>
            </>
          )}
        </div>

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
