CREATE OR REPLACE FUNCTION public.get_worker_active_booking(_worker_id uuid)
RETURNS TABLE(booking_id uuid, status text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT b.id, b.status::text, b.created_at
  FROM public.bookings b
  WHERE b.worker_id = _worker_id
    AND b.status::text IN ('accepted','on_the_way','arrived','in_progress',
                           'awaiting_customer_confirmation','worker_on_the_way',
                           'work_started','worker_marked_complete','disputed')
    AND (
      auth.uid() = _worker_id
      OR auth.uid() = b.customer_id
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  ORDER BY b.created_at DESC
  LIMIT 1;
$function$;