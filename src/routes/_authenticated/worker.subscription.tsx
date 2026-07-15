import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/worker/subscription")({
  component: SubscriptionPage,
});

const PLANS = [
  { id: "basic", name: "Basic", price: 50, features: ["Profile listing","Receive bookings"] },
  { id: "premium", name: "Premium", price: 100, features: ["Higher search ranking","Verified priority","Featured profile"] },
  { id: "elite", name: "Elite", price: 200, features: ["Homepage promotion","Priority leads","Premium support"] },
];

function SubscriptionPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const subscribe = async (plan: string) => {
    if (!user) return;
    setBusy(plan);
    // Demo: simulate activation. Real payment integration (Paystack/MoMo) goes here.
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("worker_profiles").update({
      subscription_plan: plan as any,
      subscription_expires_at: expires,
      is_featured: plan !== "basic",
    }).eq("user_id", user.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${plan} plan activated for 30 days (demo).`);
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-4 pb-8 rounded-b-3xl">
        <BackButton fallback="/worker/dashboard" className="text-primary-foreground/90 hover:text-primary-foreground mb-2" />
        <h1 className="font-display text-2xl font-bold">Subscription</h1>
        <p className="text-sm opacity-80">Choose a plan to receive bookings</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {PLANS.map(p => (
          <div key={p.id} className="rounded-2xl bg-card border border-border p-5 shadow-card">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display font-bold text-lg">{p.name}</h3>
              <p><span className="font-display font-extrabold text-2xl text-primary">GH₵{p.price}</span><span className="text-sm text-muted-foreground">/mo</span></p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {p.features.map(f => <li key={f} className="text-sm inline-flex items-center gap-2"><Check className="size-4 text-success"/>{f}</li>)}
            </ul>
            <button onClick={() => subscribe(p.id)} disabled={busy===p.id} className="mt-4 w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50">
              {busy === p.id ? "Activating…" : "Choose plan"}
            </button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground text-center">Payment via Paystack / MoMo coming soon. Demo activation runs for 30 days.</p>
      </main>
    </div>
  );
}
