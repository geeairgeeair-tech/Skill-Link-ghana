import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";
import { Plus, ShieldCheck, Clock, XCircle, Trash2, Upload, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/professions")({
  component: ProfessionsPage,
});

function ProfessionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name, slug").eq("active", true).order("sort_order")).data ?? [],
  });

  const { data: profs, isLoading } = useQuery({
    queryKey: ["my-professions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("worker_professions")
        .select("*, categories(name, slug)")
        .eq("user_id", user!.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const count = (profs ?? []).length;
  const remaining = 3 - count;

  const removeOne = async (id: string) => {
    if (!confirm("Remove this profession?")) return;
    const { error } = await supabase.from("worker_professions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["my-professions"] });
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <BackButton fallback="/worker/dashboard" />
          <h1 className="font-display text-2xl font-bold mt-2">My professions</h1>
          <p className="text-sm opacity-80">Add up to 3 verified professions. Each needs admin approval.</p>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3 pb-32">
        {isLoading ? <p className="text-sm text-muted-foreground p-4">Loading…</p> : null}
        {(profs ?? []).map((p: any) => (
          <div key={p.id} className="rounded-2xl bg-card border border-border p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="font-display font-bold">{p.categories?.name ?? "Profession"}</p>
                <p className="text-xs text-muted-foreground">{p.is_primary ? "Primary" : "Additional"} · {p.years_experience ?? 0} yrs experience</p>
              </div>
              <StatusPill status={p.verification_status} />
            </div>
            {p.bio && <p className="text-sm mt-2 text-foreground/80">{p.bio}</p>}
            {p.verification_status === "rejected" && p.rejection_reason && (
              <p className="text-xs mt-2 text-destructive"><span className="font-semibold">Reason:</span> {p.rejection_reason}</p>
            )}
            {!p.is_primary && (p.verification_status === "pending" || p.verification_status === "rejected") && (
              <button onClick={() => removeOne(p.id)} className="mt-3 text-xs text-destructive font-semibold inline-flex items-center gap-1">
                <Trash2 className="size-3"/> Remove
              </button>
            )}
          </div>
        ))}

        {remaining > 0 && !adding && (
          <button onClick={() => setAdding(true)} className="w-full rounded-2xl bg-primary text-primary-foreground py-3 font-semibold inline-flex items-center justify-center gap-2">
            <Plus className="size-4"/> Add profession ({remaining} left)
          </button>
        )}
        {remaining <= 0 && (
          <div className="rounded-2xl bg-muted border border-border p-4 text-sm text-center text-muted-foreground">
            You've reached the 3-profession limit. Remove one to add another.
          </div>
        )}

        {adding && (
          <AddForm cats={cats ?? []} existing={profs ?? []} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["my-professions"] }); }} onCancel={() => setAdding(false)} />
        )}
      </main>
    </AppShell>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "approved") return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-success/20 text-success-foreground inline-flex items-center gap-1"><ShieldCheck className="size-3"/> Approved</span>;
  if (status === "pending") return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-warning/20 text-warning-foreground inline-flex items-center gap-1"><Clock className="size-3"/> Pending</span>;
  return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive inline-flex items-center gap-1"><XCircle className="size-3"/> Rejected</span>;
}

function AddForm({ cats, existing, onDone, onCancel }: any) {
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState("");
  const [bio, setBio] = useState("");
  const [years, setYears] = useState("1");
  const [portfolio, setPortfolio] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const usedCats = new Set(existing.map((e: any) => e.category_id));
  const availableCats = cats.filter((c: any) => !usedCats.has(c.id));

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    if (portfolio.length + files.length > 6) return toast.error("Max 6 images");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) { toast.error(`${file.name}: images only`); continue; }
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: max 10 MB`); continue; }
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/professions/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await supabase.storage.from("job-media").upload(path, file, { contentType: file.type });
        if (error) { toast.error(error.message); continue; }
        const { data: signed } = await supabase.storage.from("job-media").createSignedUrl(path, 60 * 60 * 24);
        setPortfolio(p => [...p, { path, url: signed?.signedUrl ?? "" }]);
      }
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!categoryId) return toast.error("Choose a profession category");
    if (bio.trim().length < 10) return toast.error("Add a short bio (10+ chars)");
    setSaving(true);
    const { error } = await supabase.rpc("worker_add_profession", {
      _category_id: categoryId,
      _bio: bio,
      _years: parseInt(years || "0", 10),
      _portfolio: portfolio.map(p => ({ path: p.path })) as any,
      _certificates: [] as any,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Submitted for admin verification");
    onDone();
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold">Add profession</h3>
        <button onClick={onCancel} className="text-xs text-muted-foreground"><X className="size-4"/></button>
      </div>
      <label className="block text-xs font-semibold">Profession
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="input mt-1 w-full">
          <option value="">Select…</option>
          {availableCats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold">Years of experience
        <input type="number" min={0} max={60} value={years} onChange={e => setYears(e.target.value)} className="input mt-1 w-full"/>
      </label>
      <label className="block text-xs font-semibold">About your skills
        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={500} className="input mt-1 w-full resize-none" placeholder="What you specialise in for this profession"/>
      </label>
      <div>
        <p className="text-xs font-semibold mb-1">Portfolio images ({portfolio.length}/6)</p>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-xs font-semibold cursor-pointer">
          <Upload className="size-3"/> {uploading ? "Uploading…" : "Add images"}
          <input type="file" accept="image/*" multiple hidden onChange={e => uploadFiles(e.target.files)} />
        </label>
        {portfolio.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {portfolio.map((p, i) => (
              <img key={i} src={p.url} alt="" className="w-full aspect-square object-cover rounded-lg"/>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-sm font-semibold">Cancel</button>
        <button disabled={saving} onClick={submit} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
          {saving ? "Submitting…" : "Submit for verification"}
        </button>
      </div>
    </div>
  );
}
