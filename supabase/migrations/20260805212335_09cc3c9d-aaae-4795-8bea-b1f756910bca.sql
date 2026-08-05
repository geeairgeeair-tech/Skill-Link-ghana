DROP POLICY IF EXISTS "Job media read scoped" ON storage.objects;

CREATE POLICY "Job media read scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'job-media'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE (b.customer_id = auth.uid() OR b.worker_id = auth.uid())
        AND (
          b.photos @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
          OR b.progress_photos @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
          OR b.completion_photos @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
        )
    )
  )
);