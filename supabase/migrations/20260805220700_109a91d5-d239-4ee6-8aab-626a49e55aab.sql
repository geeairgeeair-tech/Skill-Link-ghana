CREATE OR REPLACE FUNCTION public.customer_create_booking(
  _submission_id uuid,
  _worker_id uuid,
  _worker_profession_id uuid,
  _category_id uuid,
  _description text,
  _address text,
  _service_area text,
  _scheduled_at timestamptz,
  _estimated_cost integer,
  _budget integer,
  _urgency text,
  _latitude numeric,
  _longitude numeric,
  _photos jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(id uuid, photos jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _customer_id uuid := auth.uid();
  _existing public.bookings%ROWTYPE;
  _profession public.worker_professions%ROWTYPE;
BEGIN
  -- The availability trigger uses an advisory transaction lock. Bound all
  -- lock acquisition inside this RPC so it returns an error instead of hanging.
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '20s', true);

  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _submission_id IS NULL THEN
    RAISE EXCEPTION 'A booking submission ID is required';
  END IF;
  IF _worker_id IS NULL OR _worker_id = _customer_id THEN
    RAISE EXCEPTION 'Please choose a valid professional';
  END IF;
  IF _worker_profession_id IS NULL THEN
    RAISE EXCEPTION 'Please choose a profession';
  END IF;
  IF _urgency IS NULL OR _urgency NOT IN ('normal', 'urgent', 'emergency') THEN
    RAISE EXCEPTION 'Invalid urgency';
  END IF;
  IF jsonb_typeof(COALESCE(_photos, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid booking media';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(_photos, '[]'::jsonb)) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR item->>'bucket' <> 'job-media'
       OR item->>'kind' NOT IN ('image', 'video')
       OR COALESCE(item->>'path', '') = ''
       OR COALESCE(item->>'name', '') = ''
       OR split_part(item->>'path', '/', 1) <> _customer_id::text
  ) THEN
    RAISE EXCEPTION 'Invalid booking media reference';
  END IF;

  SELECT * INTO _existing
  FROM public.bookings b
  WHERE b.customer_id = _customer_id
    AND b.submission_id = _submission_id;

  IF FOUND THEN
    RETURN QUERY SELECT _existing.id, _existing.photos;
    RETURN;
  END IF;

  SELECT * INTO _profession
  FROM public.worker_professions wp
  WHERE wp.id = _worker_profession_id
    AND wp.user_id = _worker_id
    AND wp.category_id = _category_id
    AND wp.verification_status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected profession is not available for this professional';
  END IF;

  BEGIN
    RETURN QUERY
    INSERT INTO public.bookings (
      customer_id, worker_id, worker_profession_id, category_id,
      description, address, service_area, scheduled_at, estimated_cost,
      budget, urgency, latitude, longitude, photos, submission_id
    ) VALUES (
      _customer_id, _worker_id, _worker_profession_id, _category_id,
      trim(_description), trim(_address), trim(_service_area), _scheduled_at,
      _estimated_cost, _budget, _urgency, _latitude, _longitude,
      COALESCE(_photos, '[]'::jsonb), _submission_id
    )
    RETURNING bookings.id, bookings.photos;
  EXCEPTION
    WHEN lock_not_available OR query_canceled THEN
      RAISE EXCEPTION 'Booking is temporarily busy. Please retry.' USING ERRCODE = '55P03';
  END;
END
$function$;

REVOKE ALL ON FUNCTION public.customer_create_booking(uuid, uuid, uuid, uuid, text, text, text, timestamptz, integer, integer, text, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_create_booking(uuid, uuid, uuid, uuid, text, text, text, timestamptz, integer, integer, text, numeric, numeric, jsonb) TO authenticated;