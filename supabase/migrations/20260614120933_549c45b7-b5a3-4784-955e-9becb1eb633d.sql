
-- 1. Profiles: require authentication to read
DROP POLICY IF EXISTS "Profiles are public readable" ON public.profiles;
CREATE POLICY "Authenticated users view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- 2. Worker profiles: column-level protection for sensitive identity docs
REVOKE SELECT (ghana_card_number, ghana_card_url, selfie_url)
  ON public.worker_profiles FROM anon, authenticated;
-- Owners and admins continue to read via the existing row-level policies; grant column access back to them via a security-definer accessor
CREATE OR REPLACE FUNCTION public.get_worker_identity(_user_id uuid)
RETURNS TABLE (ghana_card_number text, ghana_card_url text, selfie_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ghana_card_number, ghana_card_url, selfie_url
  FROM public.worker_profiles
  WHERE user_id = _user_id
    AND (auth.uid() = _user_id OR public.has_role(auth.uid(), 'admin'));
$$;
REVOKE EXECUTE ON FUNCTION public.get_worker_identity(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_worker_identity(uuid) TO authenticated;

-- 3. Platform settings: admin-only reads
DROP POLICY IF EXISTS "Settings public read" ON public.platform_settings;
CREATE POLICY "Admins read settings"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. User roles: explicit admin-only write policies (defense in depth)
CREATE POLICY "Admins insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
