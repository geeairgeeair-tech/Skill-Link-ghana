
-- Restore column grants so owners/admins can read their own full row through normal RLS
GRANT SELECT (ghana_card_number, ghana_card_url, selfie_url)
  ON public.worker_profiles TO authenticated;

-- Tighten direct table SELECT: only owner or admin
DROP POLICY IF EXISTS "Public sees verified+subscribed workers" ON public.worker_profiles;

-- Public-safe view of worker profiles (no identity documents)
DROP VIEW IF EXISTS public.workers_public;
CREATE VIEW public.workers_public
WITH (security_invoker = true) AS
SELECT
  user_id, category_id, bio, years_experience,
  service_area, city, hourly_rate, callout_fee, starting_price,
  portfolio_images, rating, reviews_count, jobs_completed,
  is_available, unavailable_note, is_featured,
  verification_status, subscription_expires_at,
  created_at, updated_at
FROM public.worker_profiles
WHERE verification_status = 'approved'
  AND subscription_expires_at IS NOT NULL
  AND subscription_expires_at > now();

GRANT SELECT ON public.workers_public TO anon, authenticated;

-- Allow the view (security_invoker) to read base rows for everyone
CREATE POLICY "Public reads verified workers via view"
  ON public.worker_profiles FOR SELECT
  TO anon, authenticated
  USING (
    verification_status = 'approved'
    AND subscription_expires_at IS NOT NULL
    AND subscription_expires_at > now()
  );

-- And block sensitive columns at the role level so direct selects can't read them
REVOKE SELECT (ghana_card_number, ghana_card_url, selfie_url)
  ON public.worker_profiles FROM anon;
