-- 1. Lock legal identity fields once they are set
CREATE OR REPLACE FUNCTION public.lock_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.first_name IS NOT NULL AND NEW.first_name IS DISTINCT FROM OLD.first_name THEN
    RAISE EXCEPTION 'Legal identity details cannot be changed directly. Contact Support if a correction is required.';
  END IF;
  IF OLD.last_name IS NOT NULL AND NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    RAISE EXCEPTION 'Legal identity details cannot be changed directly. Contact Support if a correction is required.';
  END IF;
  IF OLD.date_of_birth IS NOT NULL AND NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
    RAISE EXCEPTION 'Legal identity details cannot be changed directly. Contact Support if a correction is required.';
  END IF;
  IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
    RAISE EXCEPTION 'Legal identity details cannot be changed directly. Contact Support if a correction is required.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lock_profile_identity_trg ON public.profiles;
CREATE TRIGGER lock_profile_identity_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.lock_profile_identity();

-- 2. One-time completion of missing identity fields
CREATE OR REPLACE FUNCTION public.complete_profile_identity(
  _first_name text,
  _last_name text,
  _date_of_birth date,
  _gender text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p public.profiles%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  SELECT * INTO _p FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF _p.first_name IS NOT NULL AND _p.last_name IS NOT NULL
     AND _p.date_of_birth IS NOT NULL AND _p.gender IS NOT NULL THEN
    RAISE EXCEPTION 'Legal identity details cannot be changed directly. Contact Support if a correction is required.';
  END IF;

  IF _p.first_name IS NULL AND COALESCE(btrim(_first_name), '') = '' THEN
    RAISE EXCEPTION 'First legal name is required';
  END IF;
  IF _p.last_name IS NULL AND COALESCE(btrim(_last_name), '') = '' THEN
    RAISE EXCEPTION 'Last legal name is required';
  END IF;
  IF _p.date_of_birth IS NULL AND _date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Date of birth is required';
  END IF;
  IF _p.gender IS NULL AND COALESCE(btrim(_gender), '') = '' THEN
    RAISE EXCEPTION 'Gender is required';
  END IF;

  UPDATE public.profiles SET
    first_name = COALESCE(first_name, btrim(_first_name)),
    last_name = COALESCE(last_name, btrim(_last_name)),
    date_of_birth = COALESCE(date_of_birth, _date_of_birth),
    gender = COALESCE(gender, btrim(_gender)),
    full_name = CASE
      WHEN COALESCE(btrim(full_name), '') = ''
        THEN btrim(COALESCE(first_name, btrim(_first_name)) || ' ' || COALESCE(last_name, btrim(_last_name)))
      ELSE full_name END,
    updated_at = now()
  WHERE id = _uid;
END $$;

REVOKE ALL ON FUNCTION public.complete_profile_identity(text, text, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_profile_identity(text, text, date, text) TO authenticated;

-- 3. Professional verification reuses the account identity
CREATE OR REPLACE FUNCTION public.worker_submit_verification(_category_id uuid, _bio text, _years_experience integer, _city text, _service_area text, _hourly_rate integer, _callout_fee integer, _starting_price integer, _date_of_birth date, _portfolio_images jsonb DEFAULT '[]'::jsonb, _ghana_card_number text DEFAULT NULL::text, _ghana_card_url text DEFAULT NULL::text, _selfie_url text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, verification_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _existing public.worker_profiles%ROWTYPE;
  _status public.verification_status;
  _dob date;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit verification';
  END IF;
  IF _category_id IS NULL THEN
    RAISE EXCEPTION 'Choose your main profession';
  END IF;

  -- Single account identity: the profile date of birth wins, and is only
  -- filled from the form when the account does not have one yet.
  SELECT date_of_birth INTO _dob FROM public.profiles WHERE id = _uid;
  IF _dob IS NULL THEN
    IF _date_of_birth IS NULL THEN
      RAISE EXCEPTION 'Date of birth is required';
    END IF;
    UPDATE public.profiles SET date_of_birth = _date_of_birth, updated_at = now() WHERE id = _uid;
    _dob := _date_of_birth;
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
      _dob, btrim(_ghana_card_number), _ghana_card_url, _selfie_url,
      'pending', now()
    );

    RETURN QUERY SELECT _uid, 'pending'::text;
    RETURN;
  END IF;

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
    date_of_birth = _dob,
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
$function$;