import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";
import { EquipmentBadge } from "@/components/equipment-badge";
import { signMedia, toMediaRefs, type MediaRef } from "@/lib/media";
import { Plus, ShieldCheck, Clock, XCircle, Trash2, Upload, X, Pencil, Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker/professions")({
  component: ProfessionsPage,
});

const PORTFOLIO_BUCKET = "worker-portfolio";
const EQUIPMENT_BUCKET = "worker-docs";

function ProfessionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name, slug, group_name, requires_admin_approval").eq("active", true).order("sort_order")).data ?? [],
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

  const done = () => {
    setAdding(false);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["my-professions"] });
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-8 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <BackButton fallback="/worker/dashboard" />
          <h1 className="font-display text-2xl font-bold mt-2">My professions</h1>
          <p className="text-sm opacity-80">Add up to 3 verified professions. Each has its own bio, prices, portfolio and strengths.</p>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3 pb-32">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)
          : null}

        {(profs ?? []).map((p: any) =>
          editingId === p.id ? (
            <ProfessionForm
              key={p.id}
              mode="edit"
              cats={cats ?? []}
              existing={profs ?? []}
              profession={p}
              onDone={done}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={p.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display font-bold">{p.categories?.name ?? "Profession"}</p>
                  <p className="text-xs text-muted-foreground">{p.is_primary ? "Primary" : "Additional"} · {p.years_experience ?? 0} yrs experience</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusPill status={p.verification_status} />
                  <EquipmentPill status={p.equipment_status} />
                </div>
              </div>
              {p.bio && <p className="text-sm mt-2 text-foreground/80">{p.bio}</p>}
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="From" value={p.starting_price != null ? `GH₵${p.starting_price}` : "—"} />
                <MiniStat label="Call-out" value={p.callout_fee != null ? `GH₵${p.callout_fee}` : "—"} />
                <MiniStat label="Daily" value={p.daily_rate != null ? `GH₵${p.daily_rate}` : "—"} />
              </div>
              {(p.strengths ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(p.strengths as string[]).map((s) => (
                    <span key={s} className="text-[10px] font-semibold bg-primary-soft text-primary px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              )}
              {p.verification_status === "rejected" && p.rejection_reason && (
                <p className="text-xs mt-2 text-destructive"><span className="font-semibold">Reason:</span> {p.rejection_reason}</p>
              )}
              {p.equipment_status === "rejected" && p.equipment_rejection_reason && (
                <p className="text-xs mt-2 text-destructive"><span className="font-semibold">Equipment:</span> {p.equipment_rejection_reason}</p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <button onClick={() => setEditingId(p.id)} className="text-xs text-primary font-semibold inline-flex items-center gap-1">
                  <Pencil className="size-3" /> Edit this profession
                </button>
                {!p.is_primary && (p.verification_status === "pending" || p.verification_status === "rejected") && (
                  <button onClick={() => removeOne(p.id)} className="text-xs text-destructive font-semibold inline-flex items-center gap-1">
                    <Trash2 className="size-3" /> Remove
                  </button>
                )}
              </div>
            </div>
          ),
        )}

        {remaining > 0 && !adding && !editingId && (
          <button onClick={() => setAdding(true)} className="w-full rounded-2xl bg-primary text-primary-foreground py-3 font-semibold inline-flex items-center justify-center gap-2">
            <Plus className="size-4" /> Add profession ({remaining} left)
          </button>
        )}
        {remaining <= 0 && !editingId && (
          <div className="rounded-2xl bg-muted border border-border p-4 text-sm text-center text-muted-foreground">
            You've reached the 3-profession limit. Remove one to add another.
          </div>
        )}

        {adding && (
          <ProfessionForm mode="add" cats={cats ?? []} existing={profs ?? []} onDone={done} onCancel={() => setAdding(false)} />
        )}
      </main>
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-2">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "approved") return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-success/20 text-success-foreground inline-flex items-center gap-1"><ShieldCheck className="size-3"/> Approved</span>;
  if (status === "pending") return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-warning/20 text-warning-foreground inline-flex items-center gap-1"><Clock className="size-3"/> Pending</span>;
  return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive inline-flex items-center gap-1"><XCircle className="size-3"/> Rejected</span>;
}

function EquipmentPill({ status }: { status?: string | null }) {
  if (status === "approved") return <EquipmentBadge status="approved" />;
  if (status === "pending") return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-warning/20 text-warning-foreground inline-flex items-center gap-1"><Wrench className="size-3"/> Equipment pending</span>;
  if (status === "rejected") return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive inline-flex items-center gap-1"><Wrench className="size-3"/> Equipment rejected</span>;
  return null;
}

type Shot = MediaRef & { url: string };

function ProfessionForm({
  mode,
  cats,
  existing,
  profession,
  onDone,
  onCancel,
}: {
  mode: "add" | "edit";
  cats: any[];
  existing: any[];
  profession?: any;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const isEdit = mode === "edit";
  const [categoryId, setCategoryId] = useState(profession?.category_id ?? "");
  const [bio, setBio] = useState(profession?.bio ?? "");
  const [years, setYears] = useState(String(profession?.years_experience ?? 1));
  const [serviceDescription, setServiceDescription] = useState(profession?.service_description ?? "");
  const [startingPrice, setStartingPrice] = useState(profession?.starting_price != null ? String(profession.starting_price) : "");
  const [calloutFee, setCalloutFee] = useState(profession?.callout_fee != null ? String(profession.callout_fee) : "");
  const [dailyRate, setDailyRate] = useState(profession?.daily_rate != null ? String(profession.daily_rate) : "");
  const [strengths, setStrengths] = useState<string[]>(Array.isArray(profession?.strengths) ? profession.strengths : []);
  const [strengthDraft, setStrengthDraft] = useState("");
  const [portfolio, setPortfolio] = useState<Shot[]>([]);
  const [equipment, setEquipment] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate existing images with fresh signed URLs when editing.
  useEffect(() => {
    if (!profession) return;
    let alive = true;
    (async () => {
      const [p, e] = await Promise.all([
        signMedia(toMediaRefs(profession.portfolio_images)),
        signMedia(toMediaRefs(profession.equipment_images, EQUIPMENT_BUCKET)),
      ]);
      if (!alive) return;
      setPortfolio(p);
      setEquipment(e);
    })();
    return () => { alive = false; };
  }, [profession?.id]);

  const usedCats = new Set(existing.filter((e: any) => e.id !== profession?.id).map((e: any) => e.category_id));
  const availableCats = cats.filter((c: any) => !usedCats.has(c.id));

  const upload = async (files: FileList | null, bucket: string, folder: string, current: Shot[], setter: (fn: (p: Shot[]) => Shot[]) => void, max: number) => {
    if (!files || !user) return;
    if (current.length + files.length > max) return toast.error(`Max ${max} images`);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) { toast.error(`${file.name}: images only`); continue; }
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: max 10 MB`); continue; }
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
        if (error) { toast.error(error.message); continue; }
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 6);
        setter((p) => [...p, { path, bucket, url: signed?.signedUrl ?? "" }]);
      }
    } finally { setUploading(false); }
  };

  const addStrength = () => {
    const v = strengthDraft.trim();
    if (!v) return;
    if (strengths.length >= 5) return toast.error("Up to 5 strengths");
    if (strengths.some((s) => s.toLowerCase() === v.toLowerCase())) return toast.error("Already added");
    setStrengths([...strengths, v]);
    setStrengthDraft("");
  };

  const submit = async () => {
    if (!isEdit && !categoryId) return toast.error("Choose a profession category");
    if (bio.trim().length < 10) return toast.error("Add a short bio (10+ chars)");
    setSaving(true);
    const payload = {
      _bio: bio,
      _years: parseInt(years || "0", 10),
      _service_description: serviceDescription || null,
      _starting_price: startingPrice ? parseInt(startingPrice, 10) : null,
      _callout_fee: calloutFee ? parseInt(calloutFee, 10) : null,
      _daily_rate: dailyRate ? parseInt(dailyRate, 10) : null,
      _strengths: strengths,
      _portfolio: portfolio.map((p) => ({ path: p.path, bucket: p.bucket ?? PORTFOLIO_BUCKET })),
      _equipment: equipment.map((p) => ({ path: p.path, bucket: p.bucket ?? EQUIPMENT_BUCKET })),
    };
    const { error } = isEdit
      ? await supabase.rpc("worker_update_profession", { _profession_id: profession.id, ...payload } as any)
      : await supabase.rpc("worker_add_profession", { _category_id: categoryId, _certificates: [], ...payload } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Profession updated" : "Submitted for admin verification");
    onDone();
  };

  const selectedCat = cats.find((c: any) => c.id === categoryId);

  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold">{isEdit ? `Edit ${profession?.categories?.name ?? "profession"}` : "Add profession"}</h3>
        <button onClick={onCancel} className="text-xs text-muted-foreground"><X className="size-4"/></button>
      </div>

      {!isEdit && (
        <label className="block text-xs font-semibold">Profession
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="input mt-1 w-full">
            <option value="">Select…</option>
            {availableCats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {selectedCat?.requires_admin_approval && (
        <p className="text-[11px] rounded-xl bg-warning/15 text-warning-foreground p-2.5">
          This is a high-trust profession. Upload your professional licence or certificate — an administrator must review
          your documents before your profile becomes public. Documents are never shown publicly.
        </p>
      )}

      <label className="block text-xs font-semibold">Years of experience
        <input type="number" min={0} max={60} value={years} onChange={e => setYears(e.target.value)} className="input mt-1 w-full"/>
      </label>
      <label className="block text-xs font-semibold">About your skills (this profession only)
        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={500} className="input mt-1 w-full resize-none" placeholder="What you specialise in for this profession"/>
      </label>
      <label className="block text-xs font-semibold">Service description
        <textarea value={serviceDescription} onChange={e => setServiceDescription(e.target.value)} rows={2} maxLength={300} className="input mt-1 w-full resize-none" placeholder="What exactly you offer under this profession"/>
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label className="block text-xs font-semibold">Starting (GH₵)
          <input type="number" min={0} value={startingPrice} onChange={e => setStartingPrice(e.target.value)} className="input mt-1 w-full" placeholder="150"/>
        </label>
        <label className="block text-xs font-semibold">Call-out (GH₵)
          <input type="number" min={0} value={calloutFee} onChange={e => setCalloutFee(e.target.value)} className="input mt-1 w-full" placeholder="50"/>
        </label>
        <label className="block text-xs font-semibold">Daily (GH₵)
          <input type="number" min={0} value={dailyRate} onChange={e => setDailyRate(e.target.value)} className="input mt-1 w-full" placeholder="400"/>
        </label>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1">Professional strengths ({strengths.length}/5)</p>
        <div className="flex gap-2">
          <input
            value={strengthDraft}
            onChange={e => setStrengthDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addStrength(); } }}
            placeholder="e.g. Solar installation"
            className="input flex-1"
          />
          <button type="button" onClick={addStrength} className="px-3 rounded-lg bg-muted text-xs font-semibold">Add</button>
        </div>
        {strengths.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {strengths.map((s) => (
              <button key={s} type="button" onClick={() => setStrengths(strengths.filter(x => x !== s))}
                className="text-[11px] font-semibold bg-primary-soft text-primary px-2 py-1 rounded-full inline-flex items-center gap-1">
                {s} <X className="size-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold mb-1">Portfolio images ({portfolio.length}/6)</p>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-xs font-semibold cursor-pointer">
          <Upload className="size-3"/> {uploading ? "Uploading…" : "Add images"}
          <input type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files, PORTFOLIO_BUCKET, "portfolio", portfolio, setPortfolio, 6)} />
        </label>
        {portfolio.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {portfolio.map((p, i) => (
              <button key={p.path} type="button" onClick={() => setPortfolio(portfolio.filter((_, j) => j !== i))} className="relative">
                <img src={p.url} alt="" className="w-full aspect-square object-cover rounded-lg"/>
                <span className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5"><X className="size-3"/></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold mb-1 inline-flex items-center gap-1"><Wrench className="size-3"/> Equipment photos ({equipment.length}/6)</p>
        <p className="text-[11px] text-muted-foreground mb-1">
          Upload photos of the tools and equipment you use for this profession (e.g. toolbox, tester, ladder). An
          administrator reviews these — once approved customers see a “Verified Equipment” badge on your profile.
        </p>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-xs font-semibold cursor-pointer">
          <Upload className="size-3"/> {uploading ? "Uploading…" : "Add equipment photos"}
          <input type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files, EQUIPMENT_BUCKET, "equipment", equipment, setEquipment, 6)} />
        </label>
        {equipment.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {equipment.map((p, i) => (
              <button key={p.path} type="button" onClick={() => setEquipment(equipment.filter((_, j) => j !== i))} className="relative">
                <img src={p.url} alt="" className="w-full aspect-square object-cover rounded-lg"/>
                <span className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5"><X className="size-3"/></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-sm font-semibold">Cancel</button>
        <button disabled={saving} onClick={submit} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
          {saving ? "Saving…" : isEdit ? "Save changes" : "Submit for verification"}
        </button>
      </div>
    </div>
  );
}
