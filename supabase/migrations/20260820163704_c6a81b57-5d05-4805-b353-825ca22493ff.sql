-- 1) Convert legacy long-lived signed URLs to canonical storage paths
CREATE OR REPLACE FUNCTION public.__sign_url_to_path(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _v ~ '/storage/v1/object/sign/job-media/'
      THEN split_part(regexp_replace(_v, '^.*/storage/v1/object/sign/job-media/', ''), '?', 1)
    ELSE _v END
$$;

UPDATE public.messages
SET attachment_url = public.__sign_url_to_path(attachment_url)
WHERE attachment_url LIKE '%/storage/v1/object/sign/job-media/%';

UPDATE public.bookings b
SET progress_photos = COALESCE((
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'string'
                            THEN to_jsonb(public.__sign_url_to_path(e #>> '{}')) ELSE e END)
      FROM jsonb_array_elements(b.progress_photos) e), b.progress_photos)
WHERE b.progress_photos::text LIKE '%/storage/v1/object/sign/job-media/%';

UPDATE public.bookings b
SET completion_photos = COALESCE((
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'string'
                            THEN to_jsonb(public.__sign_url_to_path(e #>> '{}')) ELSE e END)
      FROM jsonb_array_elements(b.completion_photos) e), b.completion_photos)
WHERE b.completion_photos::text LIKE '%/storage/v1/object/sign/job-media/%';

UPDATE public.return_requests r
SET photos = COALESCE((
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'string'
                            THEN to_jsonb(public.__sign_url_to_path(e #>> '{}')) ELSE e END)
      FROM jsonb_array_elements(r.photos) e), r.photos)
WHERE r.photos::text LIKE '%/storage/v1/object/sign/job-media/%';

DROP FUNCTION public.__sign_url_to_path(text);

-- 2) Allow the same (not broader) set of authorized viewers to sign these paths
DROP POLICY IF EXISTS "Job media read scoped" ON storage.objects;
CREATE POLICY "Job media read scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'job-media' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE (b.customer_id = auth.uid() OR b.worker_id = auth.uid())
        AND (
          b.photos @> jsonb_build_array(jsonb_build_object('path', objects.name))
          OR b.progress_photos @> jsonb_build_array(jsonb_build_object('path', objects.name))
          OR b.completion_photos @> jsonb_build_array(jsonb_build_object('path', objects.name))
          OR b.photos @> jsonb_build_array(to_jsonb(objects.name))
          OR b.progress_photos @> jsonb_build_array(to_jsonb(objects.name))
          OR b.completion_photos @> jsonb_build_array(to_jsonb(objects.name))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.bookings b2 ON b2.id = m.booking_id
      WHERE m.attachment_url = objects.name
        AND (b2.customer_id = auth.uid() OR b2.worker_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.return_requests r
      WHERE (r.customer_id = auth.uid() OR r.worker_id = auth.uid())
        AND (
          r.photos @> jsonb_build_array(to_jsonb(objects.name))
          OR r.photos @> jsonb_build_array(jsonb_build_object('path', objects.name))
        )
    )
  )
);
