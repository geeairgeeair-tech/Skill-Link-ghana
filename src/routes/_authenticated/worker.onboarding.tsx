import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    category_id: "", bio: "", years_experience: 0,
    ghana_card_number: "", service_area: "Accra",
    hourly_rate: 50, callout_fee: 30, starting_price: 50,
  });
  const [loading, setLoading] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("worker_profiles").select("category_id, bio, years_experience, service_area, hourly_rate, callout_fee, starting_price").eq("user_id", user.id).maybeSingle();
      const { data: ident } = await supabase.rpc("get_worker_identity", { _user_id: user.id });
      if (data) setForm({
        category_id: data.category_id ?? "", bio: data.bio ?? "",
        years_experience: data.years_experience ?? 0,
        ghana_card_number: (ident as any)?.[0]?.ghana_card_number ?? "",
        service_area: data.service_area ?? "Accra",
        hourly_rate: data.hourly_rate ?? 50,
        callout_fee: data.callout_fee ?? 30,
        starting_price: data.starting_price ?? 50,
      });
      // Ensure user has worker role
      await supabase.from("user_roles").insert({ user_id: user.id, role: "worker" }).select();
    })();
  }, [user?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("worker_profiles").upsert({
      user_id: user.id, ...form,
    }, { onConflict: "user_id" });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved — pending admin verification.");
    navigate({ to: "/worker/dashboard" });
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-4 pb-8 rounded-b-3xl">
        <BackButton fallback="/profile" className="text-primary-foreground/90 hover:text-primary-foreground mb-2" />
        <h1 className="font-display text-2xl font-bold">Worker setup</h1>
        <p className="text-sm opacity-80">Complete your verification</p>
      </header>
      <form onSubmit={submit} className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <Field label="Category">
            <select required value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm">
              <option value="">Select…</option>
              {(cats ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Short bio">
            <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={3} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Years experience">
              <input type="number" min={0} value={form.years_experience} onChange={e => setForm({...form, years_experience: +e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
            <Field label="Service area">
              <input value={form.service_area} onChange={e => setForm({...form, service_area: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
            </Field>
          </div>
          <Field label="Ghana Card number">
            <input required value={form.ghana_card_number} onChange={e => setForm({...form, ghana_card_number: e.target.value})} placeholder="GHA-XXXXXXXXX-X" className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
          </Field>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h3 className="font-display font-bold">Pricing</h3>
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
        </div>

        <button disabled={loading} className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold disabled:opacity-50">
          {loading ? "Saving…" : "Submit for verification"}
        </button>
      </form>
    </div>
  );
}
function Field({ label, children }: any) {
  return <label className="block"><p className="text-[11px] font-semibold mb-1 text-muted-foreground uppercase tracking-wide">{label}</p>{children}</label>;
}
