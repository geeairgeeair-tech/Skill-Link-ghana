import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, MapPin, Star, Camera, Locate, ChevronLeft, CheckCircle2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/book/$workerId")({
  component: BookPage,
});

type Urgency = "normal" | "urgent" | "emergency";
type Step = "form" | "review" | "success";

function BookPage() {
  const { workerId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("form");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [budget, setBudget] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const submittedOnce = useRef(false);

  const { data: w, isLoading } = useQuery({
    queryKey: ["book-worker", workerId],
    queryFn: async () => {
      const { data: wp } = await supabase
        .from("worker_profiles")
        .select("user_id, category_id, hourly_rate, callout_fee, starting_price, service_area, city, rating, reviews_count, years_experience, is_available, verification_status, categories(id, name, slug)")
        .eq("user_id", workerId)
        .eq("verification_status", "approved")
        .maybeSingle();
      if (!wp) return null;
      const { data: prof } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", workerId).maybeSingle();
      return { ...wp, profiles: prof ?? {} } as any;
    },
  });

  const requestGps = () => {
    if (!navigator.geolocation) return toast.error("Location not supported on this device");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); toast.success("Location captured"); },
      () => toast.error("Couldn't get location — permission denied"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).slice(0, 5);
    setFiles(arr);
  };

  const goReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !address.trim() || !area.trim() || !date) {
      return toast.error("Please fill service description, address, area and preferred date");
    }
    setStep("review");
  };

  const confirmSubmit = async () => {
    if (!user || !w) return;
    if (submittedOnce.current || submitting) return;
    submittedOnce.current = true;
    setSubmitting(true);
    try {
      const scheduledAt = time ? `${date}T${time}:00` : `${date}T09:00:00`;
      const estimated = (w.callout_fee ?? 0) + (w.hourly_rate ?? 0);
      const { data: inserted, error } = await supabase.from("bookings").insert({
        customer_id: user.id,
        worker_id: workerId,
        category_id: w.category_id,
        description: description.trim(),
        address: address.trim(),
        service_area: area.trim(),
        latitude: lat,
        longitude: lng,
        scheduled_at: scheduledAt,
        estimated_cost: estimated,
        budget: budget ? Number(budget) : null,
        urgency,
      } as any).select("id").single();
      if (error) throw error;

      // Upload media (best effort)
      if (files.length) {
        for (const f of files) {
          const path = `${user.id}/bookings/${inserted.id}/${Date.now()}-${f.name}`;
          const { error: upErr } = await supabase.storage.from("job-media").upload(path, f, { upsert: false });
          if (upErr) console.warn("upload failed", upErr.message);
        }
      }
      setBookingId(inserted.id);
      setStep("success");
    } catch (err: any) {
      submittedOnce.current = false;
      toast.error(err.message ?? "Could not send booking");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading worker…</div>;
  if (!w) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="font-semibold">Worker unavailable</p>
        <Link to="/workers" className="text-primary font-semibold">Back to browse</Link>
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
            <Link to="/bookings" className="rounded-xl bg-primary text-primary-foreground py-3 font-semibold">View booking</Link>
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
          <p className="mt-1 text-xs">From <span className="font-semibold text-primary">GH₵{w.starting_price ?? 0}</span> · Call-out GH₵{w.callout_fee ?? 0} · GH₵{w.hourly_rate ?? 0}/hr</p>
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
            <Row label="Address">{address}</Row>
            <Row label="Area">{area}</Row>
            <Row label="Date & time">{date} {time || "09:00"}</Row>
            <Row label="Urgency"><span className="capitalize">{urgency}</span></Row>
            {budget && <Row label="Budget">GH₵{budget}</Row>}
            {lat && lng && <Row label="GPS">{lat.toFixed(4)}, {lng.toFixed(4)}</Row>}
            {files.length > 0 && <Row label="Attachments">{files.length} file(s)</Row>}
          </div>
          <button
            onClick={confirmSubmit}
            disabled={submitting}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Confirm & send booking"}
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

        <Field label="Service required">
          <input value={w.categories?.name ?? ""} readOnly className="w-full rounded-xl border border-input bg-muted p-3 text-sm" />
        </Field>

        <Field label="Job description">
          <textarea required value={description} onChange={(e)=>setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="What needs to be done?" />
        </Field>

        <Field label="Photos / videos (optional, up to 5)">
          <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-card p-3 text-sm cursor-pointer">
            <Camera className="size-4" />
            <span>{files.length ? `${files.length} file(s) selected` : "Attach files"}</span>
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e)=>onPickFiles(e.target.files)} />
          </label>
        </Field>

        <Field label="Service address">
          <input required value={address} onChange={(e)=>setAddress(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="e.g. House #12, East Legon" />
        </Field>

        <Field label="General service area">
          <input required value={area} onChange={(e)=>setArea(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="e.g. East Legon, Accra" />
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
