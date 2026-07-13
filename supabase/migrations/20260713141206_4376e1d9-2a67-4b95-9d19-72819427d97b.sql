
-- Tighten profiles SELECT policies
DROP POLICY IF EXISTS "Authenticated users view profiles" ON public.profiles;

REVOKE SELECT (phone, address) ON public.profiles FROM anon, authenticated;

CREATE POLICY "View own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public view basic profile info"
  ON public.profiles FOR SELECT
  USING (true);

-- SECURITY DEFINER RPC for controlled access to phone/address
CREATE OR REPLACE FUNCTION public.get_profile_contact(_id uuid)
RETURNS TABLE(phone text, address text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone, p.address
  FROM public.profiles p
  WHERE p.id = _id
    AND (
      auth.uid() = _id
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE (b.customer_id = auth.uid() AND b.worker_id = _id)
           OR (b.worker_id = auth.uid() AND b.customer_id = _id)
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_profile_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_contact(uuid) TO authenticated;

-- Worker profiles: extra defense-in-depth column revoke on phone_verified
REVOKE SELECT (phone_verified) ON public.worker_profiles FROM anon, authenticated;
