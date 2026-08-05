CREATE OR REPLACE FUNCTION public.worker_submit_verification(
  _category_id uuid,
  _bio text,
  _years_experience integer,
  _city text,
  _service_area text,
  _hourly_rate integer,
  _callout_fee integer,
  _starting_price integer,
  _date_of_birth date,
  _portfolio_images jsonb DEFAULT '[]'::jsonb,
  _ghana_card_number text DEFAULT NULL,
  _ghana_card_url text DEFAULT NULL,
  _selfie_url text DEFAULT NULL
)
RETURNS TABLE (user_id uuid, verification_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.worker_profiles%ROWTYPE;
  _status public.verification_status;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit verification';
  END IF;
  IF _category_id IS NULL THEN
    RAISE EXCEPTION 'Choose your main profession';
  END IF;
  IF _date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Date of birth is required';
  END IF;

  SELECT * INTO _existing FROM public.worker_profiles wp WHERE wp.user_id = _uid FOR UPDATE;

  IF NOT FOUND THEN
    IF COALESCE(NULLIF(btrim(_ghana_card_number), ''), NULL) IS NULL THEN
      RAISE EXCEPTION 'Enter your Ghana Card number';
    END IF;
    IF _ghana_card_url IS NULL OR _selfie_url IS NULL THEN
      RAISE EXCEPTION 'Upload your Ghana Card photo and a selfie holding your card';
    END IF;

    INSERT INTO public.worker_profiles (
      user_id, category_id, bio, years_experience, city, service_area,
      hourly_rate, callout_fee, starting_price, portfolio_images,
      date_of_birth, ghana_card_number, ghana_card_url, selfie_url,
      verification_status, documents_submitted_at
    ) VALUES (
      _uid, _category_id, _bio, _years_experience, _city, _service_area,
      _hourly_rate, _callout_fee, _starting_price, COALESCE(_portfolio_images, '[]'::jsonb),
      _date_of_birth, btrim(_ghana_card_number), _ghana_card_url, _selfie_url,
      'pending', now()
    );

    RETURN QUERY SELECT _uid, 'pending'::text;
    RETURN;
  END IF;

  -- Reuse the existing record. Approved / suspended pros keep their status.
  _status := CASE
    WHEN _existing.verification_status IN ('approved', 'suspended') THEN _existing.verification_status
    ELSE 'pending'::public.verification_status
  END;

  IF COALESCE(NULLIF(btrim(_ghana_card_number), ''), _existing.ghana_card_number) IS NULL THEN
    RAISE EXCEPTION 'Enter your Ghana Card number';
  END IF;
  IF COALESCE(_ghana_card_url, _existing.ghana_card_url) IS NULL
     OR COALESCE(_selfie_url, _existing.selfie_url) IS NULL THEN
    RAISE EXCEPTION 'Upload your Ghana Card photo and a selfie holding your card';
  END IF;

  UPDATE public.worker_profiles wp SET
    category_id = _category_id,
    bio = _bio,
    years_experience = _years_experience,
    city = _city,
    service_area = _service_area,
    hourly_rate = _hourly_rate,
    callout_fee = _callout_fee,
    starting_price = _starting_price,
    portfolio_images = COALESCE(_portfolio_images, '[]'::jsonb),
    date_of_birth = _date_of_birth,
    ghana_card_number = COALESCE(NULLIF(btrim(_ghana_card_number), ''), wp.ghana_card_number),
    ghana_card_url = COALESCE(_ghana_card_url, wp.ghana_card_url),
    selfie_url = COALESCE(_selfie_url, wp.selfie_url),
    verification_status = _status,
    documents_submitted_at = now(),
    documents_resubmission_requested_at = NULL,
    documents_resubmission_reason = NULL,
    documents_last_reminder_days = NULL
  WHERE wp.user_id = _uid;

  RETURN QUERY SELECT _uid, _status::text;
END;
$$;

REVOKE ALL ON FUNCTION public.worker_submit_verification(uuid, text, integer, text, text, integer, integer, integer, date, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_submit_verification(uuid, text, integer, text, text, integer, integer, integer, date, jsonb, text, text, text) TO authenticated;