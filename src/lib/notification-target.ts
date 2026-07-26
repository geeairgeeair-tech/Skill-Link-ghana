export type NavTarget = { to: string; params?: Record<string, string> };

/** Canonical deep-link target for a notification row. */
export function notificationTarget(n: any): NavTarget | null {
  const d = n?.data ?? {};
  if (n?.type === "chat_message" && d.booking_id) {
    return { to: "/chat/$bookingId", params: { bookingId: d.booking_id } };
  }
  if (d.booking_id) {
    return { to: "/bookings/$bookingId", params: { bookingId: d.booking_id } };
  }
  if (d.job_id) return { to: "/jobs/$id", params: { id: d.job_id } };
  if (n?.type === "support_reply" || n?.type === "support_received") return { to: "/support" };
  if (typeof n?.type === "string" && n.type.startsWith("verification_")) return { to: "/worker/dashboard" };
  return null;
}
