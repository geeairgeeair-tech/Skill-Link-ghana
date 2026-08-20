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
