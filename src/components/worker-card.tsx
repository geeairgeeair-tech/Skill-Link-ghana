import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { StarRating } from "./star-rating";
import { VerificationBadge } from "./verification-badge";

export type AvailabilityState = "available" | "busy" | "unavailable";

export interface WorkerCardData {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  category_name?: string | null;
  city?: string | null;
  service_area?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  starting_price?: number | null;
  is_featured?: boolean | null;
  jobs_completed?: number | null;
  is_available?: boolean | null;
  years_experience?: number | null;
  availability_state?: AvailabilityState | null;
  verification_status?: string | null;
  /** Approved additional professions (max 2 shown), excluding the primary. */
  professions?: string[];
}


const STATE_LABEL: Record<AvailabilityState, string> = {
  available: "Active",
  busy: "Busy",
  unavailable: "Unavailable",
};

export function WorkerCard({ w, locked = false }: { w: WorkerCardData; locked?: boolean }) {
  const state: AvailabilityState =
    w.availability_state ?? ((w.is_available ?? true) ? "available" : "unavailable");
  
  const dotClass =
    state === "available" ? "bg-success" : state === "busy" ? "bg-gold" : "bg-muted-foreground/60";
  const badgeClass =
    state === "available"
      ? "bg-success/15 text-success"
      : state === "busy"
        ? "bg-gold/20 text-gold-foreground"
        : "bg-muted text-muted-foreground";
  const className =
    "block rounded-2xl border border-border bg-card p-3 shadow-card hover:shadow-elevated transition-all";
  const linkProps = locked
    ? ({ to: "/auth", search: { mode: "login", role: "customer" } } as const)
    : ({ to: "/workers/$id", params: { id: w.user_id } } as const);
  return (
    <Link {...(linkProps as any)} className={className}>

      <div className="flex gap-3">
        <div className="relative size-16 shrink-0 rounded-xl bg-primary-soft overflow-hidden flex items-center justify-center text-primary font-bold text-xl">
          {w.avatar_url ? (
            <img src={w.avatar_url} alt={w.full_name} className="size-full object-cover" />
          ) : (
            w.full_name?.[0]?.toUpperCase() ?? "?"
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-2 ring-card ${dotClass}`}
            title={STATE_LABEL[state]}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="font-semibold truncate">{w.full_name || "Unnamed"}</p>
            <VerificationBadge status={w.verification_status ?? "approved"} compact />
            {w.is_featured && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-gold/20 text-gold-foreground px-1.5 py-0.5 rounded">
                Featured
              </span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${badgeClass}`}>
              {STATE_LABEL[state]}
            </span>
          </div>

          <p className="text-sm text-muted-foreground truncate">{w.category_name ?? "Pro"}</p>
          {(w.professions ?? []).length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {(w.professions ?? []).slice(0, 2).map((name) => (
                <span key={name} className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {name}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <StarRating value={Number(w.rating ?? 0)} count={w.reviews_count ?? 0} />
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {w.service_area ?? w.city ?? "Accra"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-primary">From GH₵{w.starting_price ?? 0}</span>
            <span className="text-[11px] text-muted-foreground">
              {w.years_experience ? `${w.years_experience}y exp` : null}
              {w.years_experience && w.jobs_completed ? " · " : null}
              {w.jobs_completed ? `${w.jobs_completed} jobs` : null}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
