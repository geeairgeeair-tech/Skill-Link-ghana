DROP POLICY IF EXISTS "Anyone can read job media" ON storage.objects;
CREATE POLICY "Authenticated can read job media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'job-media');

REVOKE SELECT (address) ON public.job_requests FROM PUBLIC;
REVOKE SELECT (address) ON public.job_requests FROM anon;
REVOKE SELECT (address) ON public.job_requests FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_job_request_address(_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT address
  FROM public.job_requests
  WHERE id = _id
    AND (customer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
$$;

REVOKE EXECUTE ON FUNCTION public.get_job_request_address(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_job_request_address(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_job_request_address(uuid) TO authenticated;

REVOKE SELECT (ghana_card_number, ghana_card_url, selfie_url) ON public.worker_profiles FROM PUBLIC;
REVOKE SELECT (ghana_card_number, ghana_card_url, selfie_url) ON public.worker_profiles FROM anon;
REVOKE SELECT (ghana_card_number, ghana_card_url, selfie_url) ON public.worker_profiles FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_worker_identity(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_worker_identity(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_worker_identity(uuid) TO authenticated;
