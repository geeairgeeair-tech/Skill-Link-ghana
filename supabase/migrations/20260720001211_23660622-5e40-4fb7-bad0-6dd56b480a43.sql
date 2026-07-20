
-- 1. profiles: remove ability to SELECT phone/address directly from any client
REVOKE SELECT (phone, address) ON public.profiles FROM anon, authenticated;

-- 2. profiles: narrow the public read policy to approved + subscribed workers
DROP POLICY IF EXISTS "Public view worker profiles" ON public.profiles;
CREATE POLICY "Public view approved worker names"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles wp
      WHERE wp.user_id = profiles.id
        AND wp.verification_status = 'approved'
        AND wp.subscription_expires_at IS NOT NULL
        AND wp.subscription_expires_at > now()
    )
  );

-- 3. worker_profiles: remove ability to SELECT identity/verification columns directly
REVOKE SELECT (ghana_card_number, ghana_card_url, selfie_url, phone_verified)
  ON public.worker_profiles FROM anon, authenticated;
