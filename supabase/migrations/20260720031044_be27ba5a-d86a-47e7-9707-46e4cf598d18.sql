
DROP POLICY IF EXISTS "Public reads verified workers via view" ON public.worker_profiles;
CREATE POLICY "Public reads verified workers via view" ON public.worker_profiles
  FOR SELECT USING (verification_status = 'approved'::verification_status);

DROP POLICY IF EXISTS "Public view approved worker names" ON public.profiles;
CREATE POLICY "Public view approved worker names" ON public.profiles
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    WHERE wp.user_id = profiles.id
      AND wp.verification_status = 'approved'::verification_status
  ));

CREATE OR REPLACE VIEW public.workers_public AS
SELECT user_id, category_id, bio, years_experience, service_area, city,
       hourly_rate, callout_fee, starting_price, portfolio_images,
       rating, reviews_count, jobs_completed, is_available, unavailable_note,
       is_featured, verification_status, subscription_expires_at,
       created_at, updated_at
FROM public.worker_profiles
WHERE verification_status = 'approved'::verification_status;
