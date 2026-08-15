import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, MapPin, Star, Camera, Locate, ChevronLeft, CheckCircle2, Loader2, X, RefreshCw } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { ServiceAreaSelect } from "@/components/service-area-select";
import { fetchWorkerCoverage } from "@/lib/service-areas";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/_authenticated/book/$workerId")({
  component: BookPage,
});

type Urgency = "normal" | "urgent" | "emergency";
type Step = "form" | "review" | "success";
type Upload = {
  id: string;
  name: string;
  path: string;
  preview: string;
  file: File;
  status: "uploading" | "done" | "error";
  error?: string;
};

const MAX_PHOTOS = 3;
const PLACEHOLDERS = ["n/a", "na", "none", "test", "unknown", "-", ".", "xxx"];

function BookPage() {
  const { workerId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("form");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [budget, setBudget] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [profId, setProfId] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submittedOnce = useRef(false);
  const submissionId = useRef<string | null>(null);
  const uploadGroup = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const bookedRef = useRef(false);
  const uploadsRef = useRef<Upload[]>([]);
  uploadsRef.current = uploads;

  // Clean up any uploaded-but-unused attachments when the customer abandons the form.
  useEffect(() => {
    return () => {
      if (bookedRef.current) return;
      const paths = uploadsRef.current.filter((u) => u.status === "done").map((u) => u.path);
      if (paths.length) supabase.storage.from("job-media").remove(paths);
    };
  }, []);


  const { data: w, isLoading } = useQuery({
    queryKey: ["book-worker", workerId],
    queryFn: async () => {
      const { data: wp } = await supabase
        .from("worker_profiles")
        .select("user_id, category_id, callout_fee, starting_price, service_area, city, rating, reviews_count, years_experience, is_available, verification_status, categories(id, name, slug)")
        .eq("user_id", workerId)
        .eq("verification_status", "approved")
        .maybeSingle();
      if (!wp) return null;
      const { data: prof } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", workerId).maybeSingle();
      return { ...wp, profiles: prof ?? {} } as any;
    },
  });

  const { data: availability, isLoading: statusLoading } = useQuery({
    queryKey: ["worker-status", workerId],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_worker_public_status", { _worker_id: workerId });
      return ((data as string | null) ?? "available") as "available" | "busy" | "unavailable";
    },
  });

  const { data: professions } = useQuery({
    queryKey: ["book-worker-professions", workerId],
    queryFn: async () =>
      (await supabase
        .from("worker_professions")
        .select("id, category_id, service_description, starting_price, callout_fee, daily_rate, is_primary, categories(name)")
        .eq("user_id", workerId)
        .eq("verification_status", "approved")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
      ).data ?? [],
  });

  const profList: any[] = professions ?? [];
  // One approved profession → preselect automatically.
  useEffect(() => {
    if (!profId && profList.length === 1) setProfId(profList[0].id);
  }, [profId, profList]);
  const selectedProf: any = profList.find((p: any) => p.id === profId) ?? null;

  const blockedMessage =
    availability === "busy"
      ? "This worker is currently working on another booking."
      : "This worker is currently unavailable. Please choose another professional or check again later.";


  const requestGps = () => {
    if (!navigator.geolocation) return toast.error("Location not supported on this device");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); toast.success("Location captured"); },
      () => toast.error("Couldn't get location — permission denied"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  /** Uploads one already-compressed photo and tracks its progress state. */
  const runUpload = async (item: Upload) => {
    if (!user) return;
    setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: "uploading", error: undefined } : u)));
    const { error } = await supabase.storage
      .from("job-media")
      .upload(item.path, item.file, { upsert: true, contentType: item.file.type || undefined });
    setUploads((prev) =>
      prev.map((u) =>
        u.id === item.id ? { ...u, status: error ? "error" : "done", error: error?.message } : u,
      ),
    );
    if (error) toast.error(`Could not upload ${item.name}: ${error.message}`);
  };

  const onPickFiles = async (list: FileList | null) => {
    if (!list || !user) return;
    const room = MAX_PHOTOS - uploads.length;
    if (room <= 0) return toast.error(`You can attach up to ${MAX_PHOTOS} photos`);
    const picked = Array.from(list).slice(0, room);
    for (const raw of picked) {
      if (!raw.type.startsWith("image/")) {
        toast.error("Only photos can be attached");
        continue;
      }
      try {
        const file = await compressImage(raw);
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const item: Upload = {
          id: crypto.randomUUID(),
          name: safe,
          path: `${user.id}/bookings/${uploadGroup.current}/${crypto.randomUUID()}-${safe}`,
          preview: URL.createObjectURL(file),
          file,
          status: "uploading",
        };
        setUploads((prev) => [...prev, item]);
        void runUpload(item);
      } catch (e: any) {
        toast.error(e?.message ?? "Could not process that image");
      }
    }
  };

  const removeUpload = (item: Upload) => {
    setUploads((prev) => prev.filter((u) => u.id !== item.id));
    URL.revokeObjectURL(item.preview);
    if (item.status === "done") supabase.storage.from("job-media").remove([item.path]);
  };

  const uploading = uploads.some((u) => u.status === "uploading");
  const uploadFailed = uploads.some((u) => u.status === "error");


  const validate = () => {
    const next: Record<string, string> = {};
    const desc = description.trim();
    const addr = address.trim();
    const ar = area.trim();
    if (desc.length < 10) next.description = "Please describe the job before continuing.";
    if (addr.length < 5 || PLACEHOLDERS.includes(addr.toLowerCase())) next.address = "Enter the exact service address.";
    if (!areaId || ar.length < 2) next.area = "Select the general service area this professional covers.";
    if (!date) next.date = "Choose a preferred date.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (availability && availability !== "available") {
      return toast.error(blockedMessage);
    }
    if (profList.length > 0 && !selectedProf) {
      return toast.error("Please choose which service you need from this worker");
    }
    if (!validate()) {
      return toast.error("Please fix the highlighted fields");
    }
    setStep("review");
  };

  const confirmSubmit = async () => {
    if (!user || !w) return;
    if (submittedOnce.current || submitting) return;
    if (availability && availability !== "available") {
      return toast.error(blockedMessage);
    }
    if (profList.length > 0 && !selectedProf) {
      return toast.error("Please choose which service you need from this worker");
    }
    if (uploading) return toast.error("Please wait for your photos to finish uploading");
    if (uploadFailed) return toast.error("Retry or remove the failed photo before confirming");
    submittedOnce.current = true;
    setSubmitting(true);
    const controller = new AbortController();
    let timeout = 0;
    const timeoutFailure = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => {
        controller.abort();
        reject(new Error("Booking request timed out after 25 seconds. Please retry."));
      }, 25000);
    });
    try {
      // Photos are already in storage — the booking call only links their paths.
      const refs = uploads
        .filter((u) => u.status === "done")
        .map((u) => ({ path: u.path, bucket: "job-media", kind: "image" as const, name: u.name }));


      const scheduledAt = time ? `${date}T${time}:00` : `${date}T09:00:00`;
      const estimated = (selectedProf?.callout_fee ?? w.callout_fee ?? 0) + (selectedProf?.starting_price ?? w.starting_price ?? 0);
      const currentSubmissionId = submissionId.current ?? crypto.randomUUID();
      submissionId.current = currentSubmissionId;

      // 2. Create exactly one booking through the ownership-validating RPC.
      // The stable submission ID makes a timed-out request safe to retry.
      const rpcRequest = supabase.rpc("customer_create_booking", {
        _submission_id: currentSubmissionId,
        _worker_id: workerId,
        _worker_profession_id: selectedProf?.id ?? "",
        _category_id: selectedProf?.category_id ?? w.category_id,
        _description: description.trim(),
        _address: address.trim(),
        _service_area: area.trim(),
        _service_area_id: areaId,
        _scheduled_at: scheduledAt,
        _estimated_cost: estimated,
        _budget: budget ? Number(budget) : null,
        _urgency: urgency,
        _latitude: lat,
        _longitude: lng,
        _photos: refs,
      } as any).abortSignal(controller.signal).single();
      const { data: inserted, error } = await Promise.race([rpcRequest, timeoutFailure]);
      if (error) throw error;
      if (!inserted?.id || !Array.isArray(inserted.photos)) {
        throw new Error("Booking service returned an invalid response. Please retry.");
      }

      // 3. Confirm the media actually persisted before leaving the form.
      const saved = Array.isArray(inserted?.photos) ? inserted.photos : [];
      if (refs.length && saved.length !== refs.length) {
        throw new Error("Your photos could not be attached to the booking. Please try again.");
      }

      bookedRef.current = true;
      setBookingId(inserted.id);
      submissionId.current = null;
      setStep("success");
    } catch (err: any) {
      submittedOnce.current = false;
      const message = err?.message ?? "Could not send booking. Please try again.";
      console.error("customer_create_booking failed", {
        message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        status: err?.status,
      });
      toast.error(message);
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  };

  if (user && user.id === workerId) {
    return (
      <div className="min-h-screen bg-background px-5 pt-6">
        <BackButton fallback={`/workers/${workerId}`} />
        <div className="mx-auto max-w-md text-center space-y-3 pt-16">
          <p className="font-display text-xl font-bold">You can't book yourself</p>
          <p className="text-sm text-muted-foreground">
            This is your own professional profile. Browse other pros to hire someone else.
          </p>
          <Link to="/workers" className="inline-block rounded-xl bg-primary text-primary-foreground px-5 py-3 font-semibold">
            Browse other pros
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || statusLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading worker…</div>;
  if (!w) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="font-semibold">Worker unavailable</p>
        <Link to="/workers" className="text-primary font-semibold">Back to browse</Link>
      </div>
    );
  }


  if (availability && availability !== "available") {
    return (
      <div className="min-h-screen bg-background px-5 pt-6">
        <BackButton fallback={`/workers/${workerId}`} />
        <div className="mx-auto max-w-md text-center space-y-3 pt-16">
          <p className="font-display text-xl font-bold">
            {availability === "busy" ? "Currently busy" : "Currently unavailable"}
          </p>
          <p className="text-sm text-muted-foreground">{blockedMessage}</p>
          <Link to="/workers" className="inline-block rounded-xl bg-primary text-primary-foreground px-5 py-3 font-semibold">
            Browse other pros
          </Link>
        </div>
      </div>
    );
  }


  const p = w.profiles ?? {};

  if (step === "success") {
    return (
      <div className="min-h-screen bg-background grid place-items-center px-5">
        <div className="mx-auto max-w-md text-center space-y-4">
          <div className="mx-auto size-16 rounded-full bg-success/15 grid place-items-center">
            <CheckCircle2 className="size-8 text-success" />
          </div>
          <h1 className="font-display text-2xl font-bold">Booking request sent!</h1>
          <p className="text-sm text-muted-foreground">{p.full_name ?? "The pro"} has been notified and will respond shortly.</p>
          <div className="grid gap-2 pt-2">
            {bookingId ? (
              <Link to="/bookings/$bookingId" params={{ bookingId }} className="rounded-xl bg-primary text-primary-foreground py-3 font-semibold">View booking</Link>
            ) : (
              <Link to="/bookings" className="rounded-xl bg-primary text-primary-foreground py-3 font-semibold">View booking</Link>
            )}
            <Link to="/workers" className="rounded-xl border border-input py-3 font-semibold">Back to Browse Pros</Link>
            <Link to="/" className="text-sm text-muted-foreground">Back to home</Link>
          </div>
        </div>
      </div>
    );
  }

  const summary = (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className="size-14 rounded-xl bg-primary-soft grid place-items-center overflow-hidden text-primary font-bold">
          {p.avatar_url ? <img src={p.avatar_url} alt={p.full_name ?? ""} className="size-full object-cover" /> : (p.full_name?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="font-semibold truncate">{p.full_name ?? "Pro"}</p>
            <BadgeCheck className="size-4 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground">{w.categories?.name}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Star className="size-3 fill-gold text-gold" />{Number(w.rating ?? 0).toFixed(1)} ({w.reviews_count ?? 0})</span>
            <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{w.service_area ?? w.city ?? "Ghana"}</span>
            <span>{w.years_experience ?? 0}y exp</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
              From GH₵{selectedProf?.starting_price ?? w.starting_price ?? 0}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              Call-out GH₵{selectedProf?.callout_fee ?? w.callout_fee ?? 0}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              Daily GH₵{selectedProf?.daily_rate ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (step === "review") {
    return (
      <div className="min-h-screen bg-background pb-12">
        <header className="px-5 pt-5 pb-4">
          <button onClick={() => setStep("form")} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> Edit details</button>
          <h1 className="font-display text-2xl font-bold mt-2">Review & confirm</h1>
        </header>
        <div className="mx-auto max-w-md px-5 space-y-3">
          {summary}
          <div className="rounded-2xl bg-card border border-border p-4 space-y-2 text-sm">
            <Row label="Service">{w.categories?.name}</Row>
            <Row label="Description">{description}</Row>
            <Row label="General service area">{area}</Row>
            <Row label="Exact service address">{address}</Row>
            <Row label="Profession">{selectedProf?.categories?.name ?? w.categories?.name ?? "Service"}</Row>
            <Row label="Date & time">{date} {time || "09:00"}</Row>

            <Row label="Urgency"><span className="capitalize">{urgency}</span></Row>
            {budget && <Row label="Budget">GH₵{budget}</Row>}
            {lat && lng && <Row label="GPS">{lat.toFixed(4)}, {lng.toFixed(4)}</Row>}
            {uploads.length > 0 && (
              <Row label="Photos">
                {uploads.filter((u) => u.status === "done").length} of {uploads.length} uploaded
              </Row>
            )}
          </div>
          {uploading && <p className="text-xs text-muted-foreground">Uploading photos… please wait before confirming.</p>}
          {uploadFailed && <p className="text-xs text-destructive">A photo failed to upload — go back and retry or remove it.</p>}
          <button
            onClick={confirmSubmit}
            disabled={submitting || uploading || uploadFailed}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50"
          >
            {submitting ? "Sending…" : uploading ? "Uploading photos…" : "Confirm & send booking"}
          </button>
          <button onClick={() => setStep("form")} disabled={submitting} className="w-full rounded-xl border border-input py-3 font-semibold">Back to edit</button>

        </div>
      </div>
    );
  }

  // FORM step
  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="px-5 pt-5 pb-4">
        <BackButton fallback={`/workers/${workerId}`} />
        <h1 className="font-display text-2xl font-bold mt-2">Book this pro</h1>
      </header>
      <form onSubmit={goReview} className="mx-auto max-w-md px-5 space-y-3">
        {summary}

        <Field label="Which service do you need from this worker?">
          {profList.length > 1 ? (
            <div className="space-y-2">
              {profList.map((pr: any) => (
                <label
                  key={pr.id}
                  className={`flex items-start gap-2 rounded-xl border p-3 text-sm cursor-pointer ${profId === pr.id ? "border-primary bg-primary-soft" : "border-input bg-card"}`}
                >
                  <input
                    type="radio"
                    name="profession"
                    className="mt-1"
                    checked={profId === pr.id}
                    onChange={() => setProfId(pr.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-semibold block">
                      {pr.categories?.name ?? "Service"}
                      {pr.is_primary ? " · Primary" : ""}
                    </span>
                    {pr.service_description && (
                      <span className="text-xs text-muted-foreground block">{pr.service_description}</span>
                    )}
                    {pr.starting_price != null && (
                      <span className="text-xs text-primary font-semibold">From GH₵{pr.starting_price}</span>
                    )}
                  </span>
                </label>
              ))}
              {!selectedProf && (
                <p className="text-xs text-destructive">Select a profession to continue.</p>
              )}
            </div>
          ) : (
            <input
              value={selectedProf?.categories?.name ?? w.categories?.name ?? ""}
              readOnly
              className="w-full rounded-xl border border-input bg-muted p-3 text-sm"
            />
          )}
        </Field>

        <Field label="Job description">
          <textarea required value={description} onChange={(e)=>{setDescription(e.target.value); setErrors((p)=>({...p, description: ""}));}} rows={4} className={`w-full rounded-xl border bg-card p-3 text-sm ${errors.description ? "border-destructive" : "border-input"}`} placeholder="What needs to be done? (at least 10 characters)" />
          {errors.description && <p className="text-xs text-destructive mt-1">{errors.description}</p>}
        </Field>

        <Field label={`Photos (optional, up to ${MAX_PHOTOS})`}>
          <div className="space-y-2">
            {uploads.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {uploads.map((u) => (
                  <div key={u.id} className="relative size-20 rounded-xl overflow-hidden border border-border bg-muted">
                    <img src={u.preview} alt={u.name} className="size-full object-cover" />
                    {u.status !== "done" && (
                      <span className="absolute inset-0 grid place-items-center bg-foreground/40">
                        {u.status === "uploading" ? (
                          <Loader2 className="size-5 animate-spin text-background" />
                        ) : (
                          <button type="button" onClick={() => runUpload(u)} aria-label="Retry upload">
                            <RefreshCw className="size-5 text-background" />
                          </button>
                        )}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeUpload(u)}
                      className="absolute top-0.5 right-0.5 size-5 rounded-full bg-background/90 grid place-items-center"
                      aria-label="Remove photo"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploads.length < MAX_PHOTOS && (
              <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-card p-3 text-sm cursor-pointer">
                <Camera className="size-4" />
                <span>Add photo</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e)=>{ void onPickFiles(e.target.files); e.currentTarget.value = ""; }} />
              </label>
            )}
            {uploading && <p className="text-xs text-muted-foreground">Uploading photos…</p>}
            {uploadFailed && <p className="text-xs text-destructive">A photo failed to upload — retry or remove it.</p>}
          </div>
        </Field>


        <Field label="General service area">
          {coverageIds && coverageIds.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              This professional has not set their service areas yet.
            </p>
          ) : (
            <ServiceAreaSelect
              value={areaId}
              allowedIds={coverageIds ?? []}
              invalid={!!errors.area}
              emptyMessage="This professional does not currently serve that area."
              notServedMessage="This Professional does not currently serve that area."
              onChange={(id, a) => {
                setAreaId(id);
                setArea(a?.name ?? "");
                setErrors((p) => ({ ...p, area: "" }));
              }}
            />
          )}
          {errors.area && <p className="text-xs text-destructive mt-1">{errors.area}</p>}
        </Field>

        <Field label="Exact service address">
          <input required value={address} onChange={(e)=>{setAddress(e.target.value); setErrors((p)=>({...p, address: ""}));}} className={`w-full rounded-xl border bg-card p-3 text-sm ${errors.address ? "border-destructive" : "border-input"}`} placeholder="e.g. House #12, East Legon" />
          {errors.address && <p className="text-xs text-destructive mt-1">{errors.address}</p>}
        </Field>


        <button type="button" onClick={requestGps} className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-input py-2.5 text-sm font-semibold">
          <Locate className="size-4" /> {lat && lng ? `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Use my current location"}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Preferred date">
            <input required type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
          <Field label="Preferred time">
            <input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
        </div>

        <Field label="Budget (optional, GH₵)">
          <input type="number" min="0" value={budget} onChange={(e)=>setBudget(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="e.g. 300" />
        </Field>

        <Field label="Urgency">
          <div className="grid grid-cols-3 gap-2">
            {(["normal","urgent","emergency"] as Urgency[]).map(u => (
              <button key={u} type="button" onClick={()=>setUrgency(u)} className={`rounded-xl py-2.5 text-sm font-semibold capitalize border ${urgency===u ? "bg-primary text-primary-foreground border-primary" : "border-input bg-card"}`}>
                {u}
              </button>
            ))}
          </div>
        </Field>

        <button type="submit" className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold">
          Review booking
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><p className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">{label}</p>{children}</label>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
