-- 1. Column-level privacy on job_requests
REVOKE SELECT ON public.job_requests FROM authenticated;
GRANT SELECT (
  id, customer_id, category_id, title, description, city, budget, media, status,
  created_at, updated_at, urgency, preferred_at, service_area, region, area,
  assigned_worker_id, booking_id, cancelled_at, cancel_reason, completed_at
) ON public.job_requests TO authenticated;
GRANT ALL ON public.job_requests TO service_role;

CREATE OR REPLACE FUNCTION public.get_job_request_private(_id uuid)
RETURNS TABLE(address text, lat numeric, lng numeric, landmark text, location_instructions text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jr.address, jr.lat, jr.lng, jr.landmark, jr.location_instructions
  FROM public.job_requests jr
  WHERE jr.id = _id
    AND (
      jr.customer_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR (
        jr.assigned_worker_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = jr.booking_id
            AND b.worker_id = auth.uid()
            AND b.status::text IN ('accepted','on_the_way','worker_on_the_way','arrived',
                                   'in_progress','work_started','worker_marked_complete',
                                   'awaiting_customer_confirmation','disputed','completed')
        )
      )
    );
$$;
REVOKE EXECUTE ON FUNCTION public.get_job_request_private(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_request_private(uuid) TO authenticated;

-- 2. Signed access to photos of OPEN job requests (bucket stays private)
DROP POLICY IF EXISTS "Open job media readable to authenticated" ON storage.objects;
CREATE POLICY "Open job media readable to authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.job_requests jr
    WHERE jr.status = 'open'::job_request_status
      AND jr.media @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
  )
);

-- 3. Portfolio visibility scoped by verification status
DROP POLICY IF EXISTS "Portfolio public read" ON public.worker_portfolio;
CREATE POLICY "Approved worker portfolio public read"
ON public.worker_portfolio FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    WHERE wp.user_id = public.worker_portfolio.worker_id
      AND wp.verification_status::text = 'approved'
  )
);

-- 4. SECURITY DEFINER functions no longer callable by signed-out users
REVOKE EXECUTE ON FUNCTION public.get_worker_public_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_worker_public_status(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_busy_workers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_busy_workers() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_primary_profession() FROM PUBLIC, anon, authenticated;
