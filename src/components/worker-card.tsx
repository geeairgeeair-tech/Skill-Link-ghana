import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin } from "lucide-react";
import { StarRating } from "./star-rating";

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
}

export function WorkerCard({ w }: { w: WorkerCardData }) {
  const available = w.is_available ?? true;
  return (
    <Link
      to="/workers/$id"
      params={{ id: w.user_id }}
      className="block rounded-2xl border border-border bg-card p-3 shadow-card hover:shadow-elevated transition-all"
    >
      <div className="flex gap-3">
        <div className="relative size-16 shrink-0 rounded-xl bg-primary-soft overflow-hidden flex items-center justify-center text-primary font-bold text-xl">
          {w.avatar_url ? (
            <img src={w.avatar_url} alt={w.full_name} className="size-full object-cover" />
          ) : (
            w.full_name?.[0]?.toUpperCase() ?? "?"
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-2 ring-card ${available ? "bg-success" : "bg-muted-foreground/60"}`}
            title={available ? "Available" : "Unavailable"}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="font-semibold truncate">{w.full_name || "Unnamed"}</p>
            <BadgeCheck className="size-4 text-primary fill-primary-soft shrink-0" />
            {w.is_featured && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-gold/20 text-gold-foreground px-1.5 py-0.5 rounded">
                Featured
              </span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${available ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              {available ? "Available" : "Unavailable"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{w.category_name ?? "Pro"}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <StarRating value={Number(w.rating ?? 0)} count={w.reviews_count ?? 0} />
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {w.service_area ?? w.city ?? "Accra"}
            </span>
          </div>
          <div className="mt-1 text-sm">
            <span className="font-semibold text-primary">From GH₵{w.starting_price ?? 0}</span>
            {w.jobs_completed ? (
              <span className="text-muted-foreground"> · {w.jobs_completed} jobs</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
