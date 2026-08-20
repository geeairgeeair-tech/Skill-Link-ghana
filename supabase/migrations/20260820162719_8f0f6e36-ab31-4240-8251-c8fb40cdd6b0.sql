DROP POLICY IF EXISTS "Open job media readable to authenticated" ON storage.objects;

CREATE POLICY "Open job media readable to authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-media'
  AND EXISTS (
    SELECT 1 FROM public.job_requests jr
    WHERE jr.status = 'open'
      AND (storage.foldername(objects.name))[1] = jr.customer_id::text
      AND jr.media @> jsonb_build_array(jsonb_build_object('path', objects.name))
  )
);