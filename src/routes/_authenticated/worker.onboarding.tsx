import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BackButton } from "@/components/back-button";
import { AvatarUpload } from "@/components/avatar-upload";
import { ImageUpload } from "@/components/image-upload";

export const Route = createFileRoute("/_authenticated/worker/onboarding")({
  head: () => ({ meta: [{ title: "Worker setup — Skill Link" }] }),
  component: Onboarding,
});

function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    category_id: "", bio: "", years_experience: 0,
    ghana_card_number: "", service_area: "Accra", city: "Accra",
    hourly_rate: 50, callout_fee: 30, starting_price: 50,
    date_of_birth: "",
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [ghanaCard, setGhanaCard] = useState<string[]>([]);
  const [selfie, setSelfie] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [commit, setCommit] = useState(false);
  const [docsOnFile, setDocsOnFile] = useState({ card: false, selfie: false, number: false });
  const [status, setStatus] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("worker_profiles")
        .select("category_id, bio, years_experience, service_area, city, hourly_rate, callout_fee, starting_price, portfolio_images, verification_status")
        .eq("user_id", user.id).maybeSingle();
      const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: user.id });
      const idRow: any = (ident as any)?.[0] ?? {};
      const { data: prof } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
      setAvatarUrl(prof?.avatar_url ?? null);
      if (data) {
        setStatus((data as any).verification_status ?? null);
        setForm({
          category_id: data.category_id ?? "", bio: data.bio ?? "",
          years_experience: data.years_experience ?? 0,
          ghana_card_number: "",
          service_area: data.service_area ?? "Accra",
          city: (data as any).city ?? "Accra",
          hourly_rate: data.hourly_rate ?? 50,
          callout_fee: data.callout_fee ?? 30,
          starting_price: data.starting_price ?? 50,
          date_of_birth: idRow.date_of_birth ?? "",
        });
        setPortfolio(Array.isArray(data.portfolio_images) ? (data.portfolio_images as any[]).filter((x) => typeof x === "string") : []);
        setCommit(true);
        setDocsOnFile({
          card: !!idRow.ghana_card_url,
          selfie: !!idRow.selfie_url,
          number: !!idRow.ghana_card_number,
        });
      }
    })();
  }, [user?.id]);

  const maxDob = new Date();
  maxDob.setFullYear(maxDob.getFullYear() - 18);
  const maxDobStr = maxDob.toISOString().slice(0, 10);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.category_id) return toast.error("Choose your main profession");
    if (!form.date_of_birth) return toast.error("Date of birth is required");
    const dob = new Date(form.date_of_birth);
    if (Number.isNaN(dob.getTime())) return toast.error("Invalid date of birth");
    if (dob > maxDob) return toast.error("You must be at least 18 years old to register as a worker");
    if (!ghanaCard[0] && !docsOnFile.card) return toast.error("Upload a photo of your Ghana Card");
    if (!selfie[0] && !docsOnFile.selfie) return toast.error("Upload a selfie holding your Ghana Card");
    if (!form.ghana_card_number.trim() && !docsOnFile.number) return toast.error("Enter your Ghana Card number");
    if (!commit) return toast.error("Please accept the professional commitment");

    setLoading(true);
    const { ghana_card_number, ...rest } = form;
    const payload: any = {
      user_id: user.id,
      ...rest,
      portfolio_images: portfolio,
      documents_submitted_at: new Date().toISOString(),
      documents_resubmission_requested_at: null,
      documents_resubmission_reason: null,
      documents_last_reminder_days: null,
    };
    if (ghana_card_number.trim()) payload.ghana_card_number = ghana_card_number.trim();
    if (ghanaCard[0]) payload.ghana_card_url = ghanaCard[0];
    if (selfie[0]) payload.selfie_url = selfie[0];

    const { error } = await supabase.from("worker_profiles").upsert(payload, { onConflict: "user_id" });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Documents submitted — pending admin verification.");
    navigate({ to: "/worker/dashboard" });
  };


  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-4 pb-8 rounded-b-3xl">
        <BackButton fallback="/profile" className="text-primary-foreground/90 hover:text-primary-foreground mb-2" />
        <h1 className="font-display text-2xl font-bold">Worker setup</h1>
        <p className="text-sm opacity-80">Complete your profile & verification</p>
      </header>
      <form onSubmit={submit} className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {status && (
          <div className="rounded-2xl bg-card border border-border p-3 text-sm">
            Verification status: <span className="font-semibold capitalize">{String(status).replace(/_/g, " ")}</span>
          </div>
        )}

        <Section title="Profile photo">
          {user && (
            <AvatarUpload userId={user.id} currentUrl={avatarUrl} fallbackText={user.email ?? "?"} onChange={setAvatarUrl} />
          )}
        </Section>

        <Section title="About your work">
          <Field label="Main profession / category">
            <select required value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm">
              <option value="">Select…</option>
              {(cats ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Short bio">
            <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={3} className="w-full rounded-xl border border-input bg-card p-3 text-sm" placeholder="Tell customers what you do best" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Years experience">
              <input type="number" min={0} value={form.years_experience} onChange={e => setForm({...form, years_experience: +e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
          </div>
          <Field label="Service area">
            <input value={form.service_area} onChange={e => setForm({...form, service_area: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
        </Section>

        <Section title="Pricing">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Call-out (GH₵)">
              <input type="number" min={0} value={form.callout_fee} onChange={e => setForm({...form, callout_fee: +e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
            <Field label="Hourly (GH₵)">
              <input type="number" min={0} value={form.hourly_rate} onChange={e => setForm({...form, hourly_rate: +e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
            <Field label="From (GH₵)">
              <input type="number" min={0} value={form.starting_price} onChange={e => setForm({...form, starting_price: +e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
          </div>
        </Section>

        <Section title="Identity verification">
          <Field label="Ghana Card number">
            <input required value={form.ghana_card_number} onChange={e => setForm({...form, ghana_card_number: e.target.value})} placeholder="GHA-XXXXXXXXX-X" className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
          <Field label="Date of birth">
            <input required type="date" value={form.date_of_birth} max={maxDobStr} min="1900-01-01"
              onChange={e => setForm({...form, date_of_birth: e.target.value})}
              className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            <p className="text-[11px] text-muted-foreground mt-1">Private — used for age and identity checks only. You must be 18+.</p>
          </Field>
          {user && (
            <>
              <ImageUpload bucket="worker-docs" userId={user.id} prefix="ghana-card"
                label="Ghana Card photo" hint="Clear photo of the front of your card. Only you and Skill Link admins can see this."
                value={ghanaCard} onChange={setGhanaCard} />
              <ImageUpload bucket="worker-docs" userId={user.id} prefix="selfie"
                label="Selfie holding your card" hint="Face clearly visible next to your Ghana Card."
                value={selfie} onChange={setSelfie} />
            </>
          )}
        </Section>

        <Section title="Portfolio">
          {user && (
            <ImageUpload bucket="worker-portfolio" userId={user.id} prefix="work" multiple max={8}
              label="Photos of your work" hint="Up to 8 photos. Customers see these on your profile."
              value={portfolio} onChange={setPortfolio} />
          )}
        </Section>

        <Section title="Professional commitment">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={commit} onChange={e => setCommit(e.target.checked)} className="mt-1" />
            <span>
              I confirm my details are true, I will arrive on time, quote fairly, complete work to a professional
              standard, and follow Skill Link's community rules. I understand false information can suspend my account.
            </span>
          </label>
        </Section>

        <button disabled={loading} className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50">
          {loading ? "Saving…" : "Submit for verification"}
        </button>
        <Link to="/worker/dashboard" className="block text-center text-sm font-semibold text-muted-foreground py-2">
          Back to dashboard
        </Link>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <h3 className="font-display font-bold">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: any) {
  return <label className="block"><p className="text-[11px] font-semibold mb-1 text-muted-foreground uppercase tracking-wide">{label}</p>{children}</label>;
}
