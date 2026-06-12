import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/new")({
  component: NewJobPage,
});

const schema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(2000),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().max(200).optional(),
  budget: z.number().int().min(0).max(1_000_000).optional(),
  category_id: z.string().uuid().optional(),
});

type MediaItem = { path: string; type: "image" | "video"; previewUrl: string };

function NewJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", city: "Accra", address: "", budget: "" as string, category_id: "" });
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name").eq("active", true).order("sort_order")).data ?? [],
  });

  const onFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    if (media.length + files.length > 6) return toast.error("Max 6 files");
    setUploading(true);
    try {
      const next: MediaItem[] = [];
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) { toast.error(`${file.name}: only images or videos`); continue; }
        if (file.size > 25 * 1024 * 1024) { toast.error(`${file.name}: max 25 MB`); continue; }
        const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await supabase.storage.from("job-media").upload(path, file, { contentType: file.type });
        if (error) { toast.error(error.message); continue; }
        next.push({ path, type: isVideo ? "video" : "image", previewUrl: URL.createObjectURL(file) });
      }
      setMedia(m => [...m, ...next]);
    } finally { setUploading(false); }
  };

  const removeMedia = async (idx: number) => {
    const item = media[idx];
    await supabase.storage.from("job-media").remove([item.path]);
    setMedia(m => m.filter((_,i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      title: form.title,
      description: form.description,
      city: form.city,
      address: form.address || undefined,
      budget: form.budget ? Number(form.budget) : undefined,
      category_id: form.category_id || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { data, error } = await supabase.from("job_requests").insert({
      customer_id: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      city: parsed.data.city,
      address: parsed.data.address,
      budget: parsed.data.budget,
      category_id: parsed.data.category_id,
      media: media.map(m => ({ path: m.path, type: m.type })),
    }).select("id").maybeSingle();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Job posted! Workers can now see it.");
    navigate({ to: "/jobs/$id", params: { id: data!.id } });
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-6 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <Link to="/jobs" className="inline-flex items-center gap-1 text-sm mb-3"><ArrowLeft className="size-4"/> Back to board</Link>
          <h1 className="font-display text-2xl font-bold">Post a job</h1>
          <p className="text-sm opacity-80">Add photos or a short video so workers know what you need.</p>
        </div>
      </header>

      <form onSubmit={submit} className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <Field label="What do you need done?">
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Build a backyard pool" className="input" required />
        </Field>
        <Field label="Category">
          <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="input">
            <option value="">Select a service…</option>
            {(cats ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Describe the work">
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={4} className="input resize-none" placeholder="Size, materials, timeline, anything important." required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="input" required />
          </Field>
          <Field label="Budget (GH₵)">
            <input value={form.budget} onChange={e => setForm({...form, budget: e.target.value.replace(/\D/g,'')})} inputMode="numeric" className="input" placeholder="Optional" />
          </Field>
        </div>
        <Field label="Address / area (optional)">
          <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input" placeholder="East Legon, near…" />
        </Field>

        <div>
          <p className="text-xs font-semibold mb-2">Photos & short video (up to 6)</p>
          <div className="grid grid-cols-3 gap-2">
            {media.map((m, i) => (
              <div key={m.path} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                {m.type === "image"
                  ? <img src={m.previewUrl} className="size-full object-cover"/>
                  : <video src={m.previewUrl} className="size-full object-cover" muted />}
                <button type="button" onClick={() => removeMedia(i)} className="absolute top-1 right-1 size-6 grid place-items-center rounded-full bg-black/60 text-white">
                  <X className="size-3"/>
                </button>
              </div>
            ))}
            {media.length < 6 && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-border grid place-items-center cursor-pointer bg-card hover:bg-muted">
                {uploading
                  ? <Loader2 className="size-5 animate-spin text-muted-foreground"/>
                  : <Upload className="size-5 text-muted-foreground"/>}
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => onFiles(e.target.files)} />
              </label>
            )}
          </div>
        </div>

        <button type="submit" disabled={busy || uploading} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
          {busy ? "Posting…" : "Post job"}
        </button>
      </form>

      <style>{`.input{width:100%;padding:0.75rem 0.875rem;border-radius:0.75rem;border:1px solid hsl(var(--input));background:hsl(var(--card));font-size:0.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px hsl(var(--ring)/0.4)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-semibold mb-1.5 block">{label}</span>{children}</label>;
}
