export type TimeWindowKey = "overnight" | "morning" | "afternoon" | "evening" | "night";

export const TIME_WINDOWS: { key: TimeWindowKey; label: string; range: string; startHour: number; endHour: number }[] = [
  { key: "overnight", label: "Overnight", range: "12 AM–6 AM", startHour: 0, endHour: 6 },
  { key: "morning", label: "Morning", range: "6 AM–12 PM", startHour: 6, endHour: 12 },
  { key: "afternoon", label: "Afternoon", range: "12 PM–5 PM", startHour: 12, endHour: 17 },
  { key: "evening", label: "Evening", range: "5 PM–9 PM", startHour: 17, endHour: 21 },
  { key: "night", label: "Night", range: "9 PM–12 AM", startHour: 21, endHour: 24 },
];

export function windowInfo(key?: string | null) {
  return TIME_WINDOWS.find(w => w.key === key) ?? null;
}

/** True when the given date + window has fully passed. */
export function windowHasPassed(dateStr: string, key: TimeWindowKey, now = new Date()) {
  const w = windowInfo(key);
  if (!w || !dateStr) return false;
  const end = new Date(`${dateStr}T00:00:00`);
  end.setHours(w.endHour, 0, 0, 0);
  return end.getTime() <= now.getTime();
}

/** Display label, e.g. "Aug 22 • Morning (6 AM–12 PM)" or "ASAP". */
export function jobTimingLabel(job: { timing_type?: string | null; preferred_at?: string | null; preferred_window?: string | null }) {
  const isScheduled = job.timing_type === "scheduled" || (!job.timing_type && !!job.preferred_at);
  if (!isScheduled) return { asap: true, text: "ASAP" };
  const d = job.preferred_at ? new Date(job.preferred_at) : null;
  const date = d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const w = windowInfo(job.preferred_window);
  const text = [date, w ? `${w.label} (${w.range})` : d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""]
    .filter(Boolean).join(" • ");
  return { asap: false, text: text || "Scheduled" };
}

export type DurationType = "single_day" | "multi_day";

export type JobDurationFields = {
  duration_type?: string | null;
  duration_start_date?: string | null;
  duration_end_date?: string | null;
};

function friendlyDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function daysBetweenInclusive(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** Friendly duration label, or null for legacy jobs with no duration data. */
export function jobDurationLabel(job: JobDurationFields): { text: string; multi: boolean } | null {
  if (job.duration_type === "single_day") return { text: "⏱ One day or less", multi: false };
  if (job.duration_type === "multi_day" && job.duration_start_date && job.duration_end_date) {
    const days = daysBetweenInclusive(job.duration_start_date, job.duration_end_date);
    return {
      text: `📆 ${friendlyDate(job.duration_start_date)} – ${friendlyDate(job.duration_end_date)} • ${days} day${days === 1 ? "" : "s"}`,
      multi: true,
    };
  }
  return null;
}
