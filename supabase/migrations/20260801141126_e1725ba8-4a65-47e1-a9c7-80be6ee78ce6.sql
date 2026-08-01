ALTER TABLE public.worker_professions
  ADD COLUMN IF NOT EXISTS callout_fee integer,
  ADD COLUMN IF NOT EXISTS daily_rate integer,
  ADD COLUMN IF NOT EXISTS strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS equipment_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS equipment_status text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS equipment_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS equipment_rejection_reason text;

DROP FUNCTION IF EXISTS public.worker_add_profession(uuid, text, integer, jsonb, jsonb, text, integer);

CREATE OR REPLACE FUNCTION public.worker_add_profession(
  _category_id uuid,
  _bio text,
  _years integer,
  _portfolio jsonb DEFAULT '[]'::jsonb,
  _certificates jsonb DEFAULT '[]'::jsonb,
  _service_description text DEFAULT NULL::text,
  _starting_price integer DEFAULT NULL::integer,
  _callout_fee integer DEFAULT NULL::integer,
  _daily_rate integer DEFAULT NULL::integer,
  _strengths jsonb DEFAULT '[]'::jsonb,
  _equipment jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _count int; _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category_id IS NULL THEN RAISE EXCEPTION 'Category is required'; END IF;
  SELECT count(*) INTO _count FROM public.worker_professions WHERE user_id = _uid;
  IF _count >= 3 THEN RAISE EXCEPTION 'Maximum of 3 professions allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.worker_professions WHERE user_id = _uid AND category_id = _category_id) THEN
    RAISE EXCEPTION 'You already have this profession';
  END IF;
  IF jsonb_array_length(coalesce(_strengths,'[]'::jsonb)) > 5 THEN
    RAISE EXCEPTION 'Maximum of 5 strengths allowed';
  END IF;
  INSERT INTO public.worker_professions
    (user_id, category_id, bio, years_experience, portfolio_images, certificates,
     verification_status, is_primary, submitted_at, service_description, starting_price,
     callout_fee, daily_rate, strengths, equipment_images, equipment_status)
  VALUES (_uid, _category_id, _bio, coalesce(_years,0), coalesce(_portfolio,'[]'::jsonb),
     coalesce(_certificates,'[]'::jsonb), 'pending',
     NOT EXISTS (SELECT 1 FROM public.worker_professions WHERE user_id = _uid),
     now(), _service_description, _starting_price,
     _callout_fee, _daily_rate, coalesce(_strengths,'[]'::jsonb), coalesce(_equipment,'[]'::jsonb),
     CASE WHEN jsonb_array_length(coalesce(_equipment,'[]'::jsonb)) > 0 THEN 'pending' ELSE 'not_submitted' END)
  RETURNING id INTO _new_id;
  RETURN _new_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.worker_add_profession(uuid, text, integer, jsonb, jsonb, text, integer, integer, integer, jsonb, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.worker_add_profession(uuid, text, integer, jsonb, jsonb, text, integer, integer, integer, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.worker_update_profession(
  _profession_id uuid,
  _bio text DEFAULT NULL,
  _years integer DEFAULT NULL,
  _service_description text DEFAULT NULL,
  _starting_price integer DEFAULT NULL,
  _callout_fee integer DEFAULT NULL,
  _daily_rate integer DEFAULT NULL,
  _strengths jsonb DEFAULT NULL,
  _portfolio jsonb DEFAULT NULL,
  _equipment jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.worker_professions;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _row FROM public.worker_professions WHERE id = _profession_id AND user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profession not found'; END IF;
  IF _strengths IS NOT NULL AND jsonb_array_length(_strengths) > 5 THEN
    RAISE EXCEPTION 'Maximum of 5 strengths allowed';
  END IF;
  UPDATE public.worker_professions SET
    bio = coalesce(_bio, bio),
    years_experience = coalesce(_years, years_experience),
    service_description = coalesce(_service_description, service_description),
    starting_price = coalesce(_starting_price, starting_price),
    callout_fee = coalesce(_callout_fee, callout_fee),
    daily_rate = coalesce(_daily_rate, daily_rate),
    strengths = coalesce(_strengths, strengths),
    portfolio_images = coalesce(_portfolio, portfolio_images),
    equipment_images = coalesce(_equipment, equipment_images),
    equipment_status = CASE
      WHEN _equipment IS NOT NULL AND _equipment IS DISTINCT FROM equipment_images
        THEN CASE WHEN jsonb_array_length(_equipment) > 0 THEN 'pending' ELSE 'not_submitted' END
      ELSE equipment_status END,
    equipment_rejection_reason = CASE
      WHEN _equipment IS NOT NULL AND _equipment IS DISTINCT FROM equipment_images THEN NULL
      ELSE equipment_rejection_reason END,
    updated_at = now()
  WHERE id = _profession_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.worker_update_profession(uuid, text, integer, text, integer, integer, integer, jsonb, jsonb, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.worker_update_profession(uuid, text, integer, text, integer, integer, integer, jsonb, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_equipment(
  _profession_id uuid,
  _approve boolean,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _worker uuid;
BEGIN
  IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT _approve AND (_reason IS NULL OR length(trim(_reason)) < 5) THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;
  UPDATE public.worker_professions SET
    equipment_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    equipment_rejection_reason = CASE WHEN _approve THEN NULL ELSE _reason END,
    equipment_reviewed_at = now(),
    updated_at = now()
  WHERE id = _profession_id
  RETURNING user_id INTO _worker;
  IF _worker IS NULL THEN RAISE EXCEPTION 'Profession not found'; END IF;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (_worker,
    CASE WHEN _approve THEN 'equipment_approved' ELSE 'equipment_rejected' END,
    CASE WHEN _approve THEN 'Equipment verified' ELSE 'Equipment verification rejected' END,
    CASE WHEN _approve THEN 'Your equipment photos were approved. Customers now see a Verified Equipment badge.' ELSE _reason END,
    jsonb_build_object('profession_id', _profession_id));
  INSERT INTO public.admin_audit_logs (admin_id, action, target_user_id, target_type, details)
  VALUES (_uid, CASE WHEN _approve THEN 'equipment_approved' ELSE 'equipment_rejected' END,
    _worker, 'worker_profession', jsonb_build_object('profession_id', _profession_id, 'reason', _reason));
END $function$;

REVOKE EXECUTE ON FUNCTION public.admin_review_equipment(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_review_equipment(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_contact(_id uuid)
RETURNS TABLE(phone text, address text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.phone, p.address
  FROM public.profiles p
  WHERE p.id = _id
    AND (
      auth.uid() = _id
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE ((b.customer_id = auth.uid() AND b.worker_id = _id)
            OR (b.worker_id = auth.uid() AND b.customer_id = _id))
          AND b.status::text IN (
            'accepted','on_the_way','worker_on_the_way','arrived','in_progress',
            'work_started','worker_marked_complete','awaiting_customer_confirmation','disputed'
          )
      )
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_profile_contact(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_profile_contact(uuid) TO authenticated;