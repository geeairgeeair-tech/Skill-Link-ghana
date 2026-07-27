
CREATE OR REPLACE FUNCTION public.list_busy_workers()
RETURNS TABLE(worker_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT b.worker_id
  FROM public.bookings b
  WHERE b.status::text IN ('accepted','on_the_way','arrived','in_progress',
                           'awaiting_customer_confirmation','worker_on_the_way',
                           'work_started','worker_marked_complete','disputed');
$$;

GRANT EXECUTE ON FUNCTION public.list_busy_workers() TO anon, authenticated;
