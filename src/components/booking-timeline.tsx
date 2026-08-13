import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  FileText,
  BadgeCheck,
  Truck,
  MapPin,
  PlayCircle,
  Image as ImageIcon,
  Flag,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEstimates, type EstimateRow } from "@/components/booking-estimate";

/* ---- pure relative-time formatter (no hooks, safe inside loops) ---- */
const MS_MIN = 60_000, MS_HR = 60 * MS_MIN, MS_DAY = 24 * MS_HR;
function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < MS_MIN) return "Just now";
  if (diff < MS_HR) { const m = Math.floor(diff / MS_MIN); return `${m} min${m === 1 ? "" : "s"} ago`; }
  if (diff < MS_DAY) { const h = Math.floor(diff / MS_HR); return `${h} hour${h === 1 ? "" : "s"} ago`; }
  if (diff < 2 * MS_DAY) return "Yesterday";
  if (diff < 7 * MS_DAY) { const dd = Math.floor(diff / MS_DAY); return `${dd} days ago`; }
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function exactTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

type StepState = "done" | "current" | "future" | "skipped";
type Step = {
  key: string;
  label: string;
  Icon: LucideIcon;
  at: string | null;       // timestamp when milestone genuinely reached
  done: boolean;           // genuine completion (for no-timestamp steps)
  sub?: string;           // extra detail (e.g. photo count)
};

export function BookingTimeline({ booking: b }: { booking: any }) {
  const { data: estimates = [] } = useEstimates(b.id);
  const { data: review } = useQuery({
    queryKey: ["booking-review", b.id],
    queryFn: async () =>
      (await supabase
        .from("reviews")
        .select("rating, comment, created_at")
        .eq("booking_id", b.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()).data ?? null,
  });

  const progressPhotos: string[] = Array.from(
    new Set(Array.isArray(b.progress_photos) ? b.progress_photos.filter((p: any) => typeof p === "string") : [])
  );

  const estimateSentAt = estimates.length
    ? estimates.reduce((min: string, e: EstimateRow) => (e.created_at < min ? e.created_at : min), estimates[0].created_at)
    : null;
  const approved = estimates.find((e) => e.status === "approved") ?? null;
  const estimateApprovedAt = approved?.approved_at ?? null;
  const customerConfirmedAt = b.customer_confirmed_at ?? b.payment_confirmed_at ?? null;

  const steps: Step[] = [
    { key: "created", label: "Booking Created", Icon: Calendar, at: b.created_at ?? null, done: !!b.created_at },
    { key: "accepted", label: "Professional Accepted", Icon: BadgeCheck, at: b.accepted_at ?? null, done: !!b.accepted_at },
    { key: "estimate_sent", label: "Estimate Sent", Icon: FileText, at: estimateSentAt, done: !!estimateSentAt },
    { key: "estimate_approved", label: "Estimate Approved", Icon: CheckCircle2, at: estimateApprovedAt, done: !!estimateApprovedAt },
    { key: "on_the_way", label: "Professional Started Journey", Icon: Truck, at: b.on_the_way_at ?? null, done: !!b.on_the_way_at },
    { key: "arrived", label: "Professional Arrived", Icon: MapPin, at: b.arrived_at ?? null, done: !!b.arrived_at },
    { key: "started", label: "Work Started", Icon: PlayCircle, at: b.started_at ?? null, done: !!b.started_at },
    {
      key: "progress_photos", label: "Progress Photos Uploaded", Icon: ImageIcon,
      at: null, done: progressPhotos.length > 0,
      sub: progressPhotos.length > 0 ? `${progressPhotos.length} photo${progressPhotos.length === 1 ? "" : "s"}` : undefined,
    },
    { key: "work_completed", label: "Work Completed", Icon: Flag, at: b.worker_completed_at ?? null, done: !!b.worker_completed_at },
    { key: "customer_confirmed", label: "Customer Confirmed", Icon: UserCheck, at: customerConfirmedAt, done: !!customerConfirmedAt },
  ];

  const status: string = b.status ?? "";
  const declined = status === "declined";
  const cancelled = status === "cancelled";

  // Furthest genuinely-reached milestone.
  let reachedIndex = -1;
  steps.forEach((s, i) => { if (s.done) reachedIndex = i; });

  // Terminal bookings only render up to where they got, plus a red endpoint.
  if (declined) {
    return (
      <TimelineShell>
        <Node step={steps[0]} state="done" />
        <TerminalNode
          label={`Declined${b.decline_reason ? ` — ${String(b.decline_reason).replace(/_/g, " ")}` : ""}`}
          at={b.updated_at ?? null}
          tone="bad"
        />
      </TimelineShell>
    );
  }

  if (cancelled) {
    return (
      <TimelineShell>
        {steps.slice(0, reachedIndex + 1).map((s) => (
          <Node key={s.key} step={s} state={s.done ? "done" : "skipped"} />
        ))}
        <TerminalNode
          label={`Cancelled by ${b.cancelled_by_role === "worker" ? "Professional" : "Customer"}`}
          at={b.cancelled_at ?? b.updated_at ?? null}
          tone="bad"
        />
      </TimelineShell>
    );
  }

  const currentIndex = reachedIndex + 1 < steps.length ? reachedIndex + 1 : -1; // -1 = all done

  return (
    <TimelineShell>
      {steps.map((s, i) => {
        let state: StepState;
        if (i <= reachedIndex) state = s.done ? "done" : "skipped";
        else if (i === currentIndex) state = "current";
        else state = "future";
        return <Node key={s.key} step={s} state={state} isLast={i === steps.length - 1} />;
      })}
    </TimelineShell>
  );
}

function TimelineShell({ children }: { children: React.ReactNode }) {
  return <ol className="relative space-y-0">{children}</ol>;
}

function Node({ step, state, isLast = false }: { step: Step; state: StepState; isLast?: boolean }) {
  const { Icon } = step;
  const indicator =
    state === "done"
      ? "bg-success/15 text-success ring-1 ring-success/30"
      : state === "current"
      ? "bg-primary text-primary-foreground ring-4 ring-primary/25 animate-pulse"
      : state === "skipped"
      ? "bg-muted text-muted-foreground ring-1 ring-border"
      : "bg-muted/50 text-muted-foreground/60 ring-1 ring-border";
  const lineColor = state === "done" ? "bg-success/30" : "bg-border";

  return (
    <li className={`relative flex items-start gap-3 ${isLast ? "pb-0" : "pb-4"}`}>
      {!isLast && <span className={`absolute left-4 top-8 bottom-0 w-0.5 ${lineColor}`} aria-hidden />}
      <span className={`relative z-10 size-8 shrink-0 grid place-items-center rounded-full ${indicator}`}>
        {state === "done" ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
      </span>
      <div className={`min-w-0 flex-1 rounded-2xl border p-3 ${
        state === "current"
          ? "border-primary/40 bg-primary-soft/40"
          : state === "done"
          ? "border-border bg-card"
          : "border-border bg-card/60"
      }`}>
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold leading-tight ${
            state === "future" || state === "skipped" ? "text-muted-foreground" : ""
          }`}>
            {step.label}
          </p>
          {state === "current" && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/15 px-2 py-0.5 rounded-full">
              In progress
            </span>
          )}
          {state === "skipped" && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              Skipped
            </span>
          )}
        </div>
        {step.sub && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{step.sub}</p>
        )}
        {state === "done" && step.at ? (
          <p className="text-[11px] text-muted-foreground mt-1">
            <span className="font-semibold text-foreground/80">{relTime(step.at)}</span>
            <span className="mx-1 opacity-50">·</span>
            <span>{exactTime(step.at)}</span>
          </p>
        ) : state === "done" && !step.at ? (
          <p className="text-[11px] text-muted-foreground mt-1">Completed</p>
        ) : state === "current" ? (
          <p className="text-[11px] text-muted-foreground mt-1">Awaiting update…</p>
        ) : state === "future" ? (
          <p className="text-[11px] text-muted-foreground/70 mt-1">Pending</p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-1">Not required</p>
        )}
      </div>
    </li>
  );
}

function TerminalNode({ label, at, tone }: { label: string; at: string | null; tone: "bad" }) {
  return (
    <li className="relative flex gap-3 pb-0">
      <span className="relative z-10 size-8 shrink-0 grid place-items-center rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/30">
        <XCircle className="size-4" />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm font-semibold text-destructive leading-tight">{label}</p>
        {at && (
          <p className="text-[11px] text-muted-foreground mt-1">
            <span className="font-semibold text-foreground/80">{relTime(at)}</span>
            <span className="mx-1 opacity-50">·</span>
            <span>{exactTime(at)}</span>
          </p>
        )}
      </div>
    </li>
  );
}
