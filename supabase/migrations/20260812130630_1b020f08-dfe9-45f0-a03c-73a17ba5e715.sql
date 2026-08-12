REVOKE SELECT ON public.bookings FROM authenticated;
REVOKE SELECT ON public.bookings FROM anon;
GRANT SELECT (id, customer_id, worker_id, category_id, description, scheduled_at, estimated_cost, status, photos, created_at, updated_at, urgency, budget, service_area, decline_reason, decline_note, declined_at, estimated_amount, final_amount, amount_paid, payment_status, started_at, worker_completed_at, customer_confirmed_at, payment_confirmed_at, completion_note, dispute_reason, dispute_details, disputed_at, admin_review_requested_at, admin_resolution_note, admin_resolved_at, reminder_count, last_reminder_at, job_application_id, accepted_at, on_the_way_at, arrived_at, final_amount_reason, final_amount_note, progress_photos, completion_photos, is_paused, paused_at, pause_reason, return_count, reopened_at, worker_profession_id, cancelled_at, cancelled_by, cancelled_by_role, cancel_reason_code, cancel_note, submission_id) ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

CREATE OR REPLACE FUNCTION public.get_booking_address(_booking_id uuid)
RETURNS TABLE(address text, latitude numeric, longitude numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.address, b.latitude, b.longitude
  FROM public.bookings b
  WHERE b.id = _booking_id
    AND (
      b.customer_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR (
        b.worker_id = auth.uid()
        AND b.status::text IN ('accepted','on_the_way','worker_on_the_way','arrived',
                               'in_progress','work_started','worker_marked_complete',
                               'awaiting_customer_confirmation','disputed')
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_booking_address(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_booking_address(uuid) TO authenticated;