/**
 * A posted job stays editable while it is open, and after a professional has
 * been selected — right up until that professional presses "I'm on my way".
 * Mirrors the backend rule in customer_update_job_request.
 */
export const PRE_TRAVEL_BOOKING_STATUSES = ["pending", "accepted"];

export function isJobEditable(
  jobStatus: string | null | undefined,
  bookingStatus?: string | null,
): boolean {
  if (jobStatus === "open") return true;
  if (jobStatus !== "assigned") return false;
  if (!bookingStatus) return true;
  return PRE_TRAVEL_BOOKING_STATUSES.includes(bookingStatus);
}
