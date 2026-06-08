import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, MapPin, Phone, MessageCircle, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StarRating } from "@/components/star-rating";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/workers/$id")({
  component: WorkerDetail,
});

function WorkerDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: w, isLoading } = useQuery({
    queryKey: ["worker", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select("*, categories(name), profiles!worker_profiles_user_id_fkey(full_name, avatar_url, phone, city)")
        .eq("user_id", id).maybeSingle();
      return data;
    },
  });
  const { data: reviews } = useQuery({
    queryKey: ["reviews", id],
    queryFn: async () => (await supabase.from("reviews").select("*, profiles!reviews_customer_id_fkey(full_name, avatar_url)").eq("worker_id", id).order("created_at",{ascending:false}).limit(10)).data ?? [],
  });

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!w) return <div className="p-8 text-center"><p>Worker not found.</p><Link to="/workers" className="text-primary font-semibold">Back to browse</Link></div>;

  const p: any = (w as any).profiles;
  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="fg-gradient-hero text-primary-foreground px-5 pt-5 pb-20 rounded-b-3xl">
        <Link to="/workers" className="inline-flex items-center gap-1 text-sm mb-4"><ArrowLeft className="size-4"/> Back</Link>
      </div>
      <div className="mx-auto max-w-md px-5 -mt-16">
        <div className="rounded-2xl bg-card border border-border shadow-elevated p-5">
          <div className="flex gap-4">
            <div className="size-20 rounded-2xl bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold text-2xl">
              {p?.avatar_url ? <img src={p.avatar_url} className="size-full object-cover" /> : (p?.full_name?.[0] ?? "?")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <h1 className="font-display text-xl font-bold truncate">{p?.full_name}</h1>
                <BadgeCheck className="size-5 text-primary fill-primary-soft" />
              </div>
              <p className="text-sm text-muted-foreground">{(w as any).categories?.name}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <StarRating value={Number((w as any).rating ?? 0)} count={(w as any).reviews_count ?? 0} />
                <span className="inline-flex items-center gap-1"><MapPin className="size-3"/>{(w as any).service_area}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5 text-center">
            <Stat label="Experience" value={`${(w as any).years_experience ?? 0}y`} />
            <Stat label="Jobs done" value={String((w as any).jobs_completed ?? 0)} />
            <Stat label="From" value={`GH₵${(w as any).starting_price ?? 0}`} />
          </div>
        </div>

        {(w as any).bio && (
          <Section title="About">
            <p className="text-sm leading-relaxed">{(w as any).bio}</p>
          </Section>
        )}

        <Section title="Pricing">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <PriceRow label="Call-out fee" value={`GH₵${(w as any).callout_fee ?? 0}`} />
            <PriceRow label="Hourly rate" value={`GH₵${(w as any).hourly_rate ?? 0}/hr`} />
          </div>
        </Section>

        <Section title={`Reviews (${reviews?.length ?? 0})`}>
          {reviews && reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.map((r: any) => (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{r.profiles?.full_name ?? "Customer"}</p>
                    <StarRating value={r.rating} />
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground mt-1">{r.comment}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          )}
        </Section>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border p-3">
        <div className="mx-auto max-w-md flex gap-2">
          {p?.phone && (
            <a href={`tel:${p.phone}`} className="size-12 grid place-items-center rounded-xl border border-input"><Phone className="size-4"/></a>
          )}
          <button className="size-12 grid place-items-center rounded-xl border border-input"><MessageCircle className="size-4"/></button>
          <button
            onClick={() => user ? navigate({ to: "/book/$workerId", params: { workerId: id } }) : navigate({ to: "/auth" })}
            className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2"
          >
            <Calendar className="size-4"/> Book now
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted p-2"><p className="font-bold">{value}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}
function Section({ title, children }: any) {
  return <section className="mt-5 rounded-2xl bg-card border border-border p-5 shadow-card"><h3 className="font-display font-bold mb-3">{title}</h3>{children}</section>;
}
function PriceRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-bold text-primary">{value}</p></div>;
}
