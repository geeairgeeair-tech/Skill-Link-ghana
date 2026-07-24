
CREATE OR REPLACE FUNCTION public.worker_add_profession(
  _category_id uuid,
  _bio text,
  _years integer,
  _portfolio jsonb DEFAULT '[]'::jsonb,
  _certificates jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _count int; _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category_id IS NULL THEN RAISE EXCEPTION 'Category is required'; END IF;
  SELECT count(*) INTO _count FROM public.worker_professions WHERE user_id = _uid;
  IF _count >= 3 THEN RAISE EXCEPTION 'Maximum of 3 professions allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.worker_professions WHERE user_id = _uid AND category_id = _category_id) THEN
    RAISE EXCEPTION 'You already have this profession';
  END IF;
  INSERT INTO public.worker_professions (user_id, category_id, bio, years_experience, portfolio_images, certificates, verification_status, is_primary, submitted_at)
  VALUES (_uid, _category_id, _bio, coalesce(_years,0), coalesce(_portfolio,'[]'::jsonb), coalesce(_certificates,'[]'::jsonb), 'pending', false, now())
  RETURNING id INTO _new_id;
  RETURN _new_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.worker_add_profession(uuid, text, integer, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_profession(_profession_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.worker_professions
    SET verification_status = 'approved', reviewed_at = now(), rejection_reason = NULL, updated_at = now()
    WHERE id = _profession_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_approve_profession(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_profession(_profession_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.worker_professions
    SET verification_status = 'rejected', reviewed_at = now(), rejection_reason = _reason, updated_at = now()
    WHERE id = _profession_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_reject_profession(uuid, text) TO authenticated;
