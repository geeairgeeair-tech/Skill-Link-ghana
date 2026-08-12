// Safe column list for direct `bookings` reads.
// The exact service address (address, latitude, longitude) is NOT readable from
// the table by app users — fetch it with the `get_booking_address` RPC, which
// only returns it to the customer, an admin, or the assigned professional while
// the booking is actively in progress.
export const BOOKING_COLUMNS = [
  "id", "customer_id", "worker_id", "category_id", "description", "scheduled_at",
  "estimated_cost", "status", "photos", "created_at", "updated_at", "urgency",
  "budget", "service_area", "decline_reason", "decline_note", "declined_at",
  "estimated_amount", "final_amount", "amount_paid", "payment_status", "started_at",
  "worker_completed_at", "customer_confirmed_at", "payment_confirmed_at",
  "completion_note", "dispute_reason", "dispute_details", "disputed_at",
  "admin_review_requested_at", "admin_resolution_note", "admin_resolved_at",
  "reminder_count", "last_reminder_at", "job_application_id", "accepted_at",
  "on_the_way_at", "arrived_at", "final_amount_reason", "final_amount_note",
  "progress_photos", "completion_photos", "is_paused", "paused_at", "pause_reason",
  "return_count", "reopened_at", "worker_profession_id", "cancelled_at",
  "cancelled_by", "cancelled_by_role", "cancel_reason_code", "cancel_note",
  "submission_id",
].join(", ");
