
CREATE OR REPLACE FUNCTION public.commitment_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT ARRAY['accepted','on_the_way','arrived','in_progress',
               'awaiting_customer_confirmation','worker_on_the_way',
               'work_started','worker_marked_complete','disputed']::text[];
$$;
REVOKE EXECUTE ON FUNCTION public.commitment_statuses() FROM anon;
