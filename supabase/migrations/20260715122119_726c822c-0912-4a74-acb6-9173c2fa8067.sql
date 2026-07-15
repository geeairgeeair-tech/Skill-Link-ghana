
-- Restrict profiles public read policy: only worker profiles are publicly viewable (still column-restricted so phone/address remain hidden from anon/authenticated)
DROP POLICY IF EXISTS "Public view basic profile info" ON public.profiles;
CREATE POLICY "Public view worker profiles" ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.worker_profiles wp WHERE wp.user_id = profiles.id));

-- Reviews: require authentication to read (no anonymous access)
DROP POLICY IF EXISTS "Reviews public read" ON public.reviews;
CREATE POLICY "Authenticated read reviews" ON public.reviews
  FOR SELECT
  TO authenticated
  USING (true);

-- Storage job-media: restrict SELECT to owner, admins, or booking counterparties
DROP POLICY IF EXISTS "Authenticated can read job media" ON storage.objects;
CREATE POLICY "Job media read scoped" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-media'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE ((storage.foldername(name))[1] = (b.customer_id)::text
               OR (storage.foldername(name))[1] = (b.worker_id)::text)
          AND (b.customer_id = auth.uid() OR b.worker_id = auth.uid())
      )
    )
  );
