import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Upload, X, Loader2, MapPin, Camera, ArrowLeft, Zap, AlertTriangle, CheckCircle2, ClipboardList, Home } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/new")({
  component: NewJobPage,
});

const schema = z.object({
  title: z.string().trim().min(4, "Give your job a clear title (4+ chars)").max(120),
  description: z.string().trim().min(10, "Add a few sentences about the work").max(2000),
  city: z.string().trim().min(2, "City is required").max(60),
  address: z.string().trim().min(3, "Address is required").max(200),
  service_area: z.string().trim().max(120).optional(),
  budget: z.number().int().min(0).max(1_000_000).optional(),
  category_id: z.string().uuid("Select a service category"),
  urgency: z.enum(["normal", "urgent", "emergency"]),
  preferred_at: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

type MediaItem = { path: string; type: "image" | "video"; previewUrl: string; progress?: number };

function NewJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: "", description: "", city: "Accra", address: "", service_area: "",
    budget: "" as string, category_id: "", urgency: "normal" as "normal"|"urgent"|"emergency",
    preferred_date: "", preferred_time: "",
    lat: undefined as number | undefined, lng: undefined as number | undefined,
  });
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name").eq("active", true).order("sort_order")).data ?? [],
  });

  const onFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    if (media.length + files.length > 6) return toast.error("Maximum 6 files per job");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) { toast.error(`${file.name}: only images or short videos`); continue; }
        if (file.size > 25 * 1024 * 1024) { toast.error(`${file.name}: max 25 MB`); continue; }
        const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const preview = URL.createObjectURL(file);
        setMedia(m => [...m, { path, type: isVideo ? "video" : "image", previewUrl: preview, progress: 0 }]);
        const { error } = await supabase.storage.from("job-media").upload(path, file, { contentType: file.type });
        if (error) {
          toast.error(`${file.name}: ${error.message}`);
          setMedia(m => m.filter(x => x.path !== path));
        } else {
          setMedia(m => m.map(x => x.path === path ? { ...x, progress: 100 } : x));
        }
      }
    } finally { setUploading(false); }
  };

  const removeMedia = async (idx: number) => {
    const item = media[idx];
    await supabase.storage.from("job-media").remove([item.path]);
    setMedia(m => m.filter((_,i) => i !== idx));
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("GPS not available on this device");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        toast.success("Location captured");
        setLocBusy(false);
      },
      (err) => {
        setLocBusy(false);
        toast.error(err.code === 1 ? "Permission denied — allow location access" : "Couldn't get your location");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const buildPayload = () => {
    const preferred_at = form.preferred_date
      ? new Date(`${form.preferred_date}T${form.preferred_time || "09:00"}:00`).toISOString()
      : undefined;
    return {
      title: form.title,
      description: form.description,
      city: form.city,
      address: form.address,
      service_area: form.service_area || undefined,
      budget: form.budget ? Number(form.budget) : undefined,
      category_id: form.category_id || undefined,
      urgency: form.urgency,
      preferred_at,
      lat: form.lat,
      lng: form.lng,
    };
  };

  const validate = () => {
    const parsed = schema.safeParse(buildPayload());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return null;
    }
    return parsed.data;
  };

  const openReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return toast.error("Wait for uploads to finish");
    const data = validate();
    if (!data) return;
    setReview(true);
  };

  const submit = async () => {
    if (!user) return;
    const data = validate();
    if (!data) return;
    setBusy(true);
    const { data: inserted, error } = await supabase.from("job_requests").insert({
      customer_id: user.id,
      status: "open",
      media: media.map(m => ({ path: m.path, type: m.type })),
      ...data,
    } as any).select("id").maybeSingle();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Job posted! Workers can see it now.");
    setReview(false);
    setPostedId(inserted!.id);
  };

  const catName = (cats ?? []).find(c => c.id === form.category_id)?.name;

  if (postedId) {
    return (
      <div className="min-h-screen bg-background grid place-items-center px-5 py-10">
        <div className="mx-auto max-w-md w-full text-center space-y-5">
          <div className="mx-auto size-20 rounded-full bg-success/15 grid place-items-center">
            <CheckCircle2 className="size-11 text-success" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Job posted!</h1>
            <p className="text-sm text-muted-foreground mt-1">Verified workers can see it now and will reach out if they can help.</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-4 text-left shadow-card">
            <p className="text-xs text-muted-foreground">Posted</p>
            <p className="font-semibold">{form.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{catName ?? "General"} · {form.city}</p>
          </div>
          <div className="space-y-2">
            <Link to="/jobs/mine" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 shadow-elevated">
              <ClipboardList className="size-4" /> View My Job Posts
            </Link>
            <Link to="/jobs/$id" params={{ id: postedId }} className="w-full h-11 rounded-xl border border-border font-semibold inline-flex items-center justify-center">
              View this job
            </Link>
            <Link to="/" className="w-full h-11 rounded-xl bg-muted font-semibold inline-flex items-center justify-center gap-2">
              <Home className="size-4" /> Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <div className="mb-3"><BackButton fallback="/jobs" /></div>
          <h1 className="font-display text-2xl font-bold">Post a job</h1>
          <p className="text-sm opacity-80">Tell us what you need. Verified workers will contact you.</p>
        </div>
      </header>

      <form onSubmit={openReview} className="mx-auto max-w-md px-5 -mt-3 space-y-4">
        <Card title="Job details">
          <Field label="Job title">
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Fix leaking kitchen sink" className="input" required maxLength={120} />
          </Field>
          <Field label="Service category">
            <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="input" required>
              <option value="">Select a service…</option>
              {(cats ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Describe the problem or work">
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={4} className="input resize-none" placeholder="Size, materials, timeline, anything a worker should know." required maxLength={2000} />
            <p className="text-[11px] text-muted-foreground mt-1">{form.description.length}/2000</p>
          </Field>
          <Field label="How urgent is this?">
            <div className="grid grid-cols-3 gap-2">
              <UrgencyChip active={form.urgency==="normal"} onClick={() => setForm({...form, urgency:"normal"})} label="Normal" tone="normal" />
              <UrgencyChip active={form.urgency==="urgent"} onClick={() => setForm({...form, urgency:"urgent"})} label="Urgent" tone="urgent" icon={<Zap className="size-3.5"/>} />
              <UrgencyChip active={form.urgency==="emergency"} onClick={() => setForm({...form, urgency:"emergency"})} label="Emergency" tone="emergency" icon={<AlertTriangle className="size-3.5"/>} />
            </div>
          </Field>
        </Card>

        <Card title="Location">
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="input" required />
            </Field>
            <Field label="Service area (optional)">
              <input value={form.service_area} onChange={e => setForm({...form, service_area: e.target.value})} className="input" placeholder="East Legon" />
            </Field>
          </div>
          <Field label="Full address">
            <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input" placeholder="House / street / landmark" required />
          </Field>
          <button type="button" onClick={useCurrentLocation} disabled={locBusy} className="w-full h-11 rounded-xl bg-primary-soft text-primary font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {locBusy ? <Loader2 className="size-4 animate-spin"/> : <MapPin className="size-4"/>}
            {form.lat ? `GPS captured (${form.lat.toFixed(4)}, ${form.lng!.toFixed(4)})` : "Use my current location"}
          </button>
        </Card>

        <Card title="Schedule & budget">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred date">
              <input type="date" value={form.preferred_date} onChange={e => setForm({...form, preferred_date: e.target.value})} min={new Date().toISOString().slice(0,10)} className="input" />
            </Field>
            <Field label="Preferred time">
              <input type="time" value={form.preferred_time} onChange={e => setForm({...form, preferred_time: e.target.value})} className="input" />
            </Field>
          </div>
          <Field label="Budget (GH₵ — optional)">
            <input value={form.budget} onChange={e => setForm({...form, budget: e.target.value.replace(/\D/g,'')})} inputMode="numeric" className="input" placeholder="e.g. 500" />
          </Field>
        </Card>

        <Card title="Photos & videos">
          <p className="text-xs text-muted-foreground mb-2">Add up to 6 photos or short videos so workers understand the work.</p>
          <div className="grid grid-cols-3 gap-2">
            {media.map((m, i) => (
              <div key={m.path} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                {m.type === "image"
                  ? <img src={m.previewUrl} className="size-full object-cover"/>
                  : <video src={m.previewUrl} className="size-full object-cover" muted />}
                {m.progress !== undefined && m.progress < 100 && (
                  <div className="absolute inset-0 bg-black/40 grid place-items-center">
                    <Loader2 className="size-5 animate-spin text-white"/>
                  </div>
                )}
                <button type="button" onClick={() => removeMedia(i)} className="absolute top-1 right-1 size-6 grid place-items-center rounded-full bg-black/60 text-white">
                  <X className="size-3"/>
                </button>
              </div>
            ))}
            {media.length < 6 && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-border grid place-items-center cursor-pointer bg-card hover:bg-muted">
                {uploading
                  ? <Loader2 className="size-5 animate-spin text-muted-foreground"/>
                  : <div className="flex flex-col items-center gap-1 text-muted-foreground"><Camera className="size-5"/><span className="text-[10px]">Add</span></div>}
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => onFiles(e.target.files)} />
              </label>
            )}
          </div>
        </Card>

        <button type="submit" disabled={busy || uploading} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 shadow-elevated">
          Review & post
        </button>
      </form>

      {review && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4">
          <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center gap-3">
              <button onClick={() => setReview(false)} className="size-9 grid place-items-center rounded-full hover:bg-muted"><ArrowLeft className="size-4"/></button>
              <h2 className="font-display font-bold">Review your post</h2>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <Row k="Title" v={form.title} />
              <Row k="Category" v={catName ?? "—"} />
              <Row k="Urgency" v={form.urgency} className="capitalize" />
              <Row k="City" v={form.city} />
              <Row k="Address" v={form.address} />
              {form.service_area && <Row k="Area" v={form.service_area} />}
              {form.lat && <Row k="GPS" v={`${form.lat.toFixed(5)}, ${form.lng!.toFixed(5)}`} />}
              {form.preferred_date && <Row k="Preferred" v={`${form.preferred_date}${form.preferred_time ? " · " + form.preferred_time : ""}`} />}
              {form.budget && <Row k="Budget" v={`GH₵${form.budget}`} />}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="whitespace-pre-wrap">{form.description}</p>
              </div>
              {media.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Media ({media.length})</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {media.map(m => (
                      <div key={m.path} className="aspect-square rounded-lg overflow-hidden bg-muted">
                        {m.type === "image"
                          ? <img src={m.previewUrl} className="size-full object-cover"/>
                          : <video src={m.previewUrl} className="size-full object-cover" muted />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setReview(false)} className="flex-1 h-11 rounded-xl border border-border font-semibold">Edit</button>
                <button onClick={submit} disabled={busy} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                  {busy ? "Posting…" : "Post job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`.input{width:100%;padding:0.75rem 0.875rem;border-radius:0.75rem;border:1px solid hsl(var(--input));background:hsl(var(--card));font-size:0.875rem;outline:none;color:hsl(var(--foreground))}.input:focus{box-shadow:0 0 0 2px hsl(var(--ring)/0.4)}`}</style>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border p-4 shadow-card space-y-3">
      <h2 className="font-display font-bold text-sm">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-semibold mb-1.5 block">{label}</span>{children}</label>;
}
function Row({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className={`font-semibold text-right ${className ?? ""}`}>{v}</span>
    </div>
  );
}
function UrgencyChip({ active, onClick, label, tone, icon }: { active: boolean; onClick: () => void; label: string; tone: "normal"|"urgent"|"emergency"; icon?: React.ReactNode }) {
  const activeCls = tone === "emergency" ? "bg-destructive text-destructive-foreground border-destructive"
    : tone === "urgent" ? "bg-gold text-gold-foreground border-gold"
    : "bg-primary text-primary-foreground border-primary";
  return (
    <button type="button" onClick={onClick} className={`h-10 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1 ${active ? activeCls : "bg-card border-border text-foreground"}`}>
      {icon}{label}
    </button>
  );
}
