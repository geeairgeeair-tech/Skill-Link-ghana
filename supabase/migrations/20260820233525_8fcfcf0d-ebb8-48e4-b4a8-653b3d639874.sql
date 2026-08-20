ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS timing_type text,
  ADD COLUMN IF NOT EXISTS preferred_window text,
  ADD COLUMN IF NOT EXISTS duration_type text,
  ADD COLUMN IF NOT EXISTS duration_start_date date,
  ADD COLUMN IF NOT EXISTS duration_end_date date;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_timing_type_check CHECK (timing_type IS NULL OR timing_type IN ('asap','scheduled')) NOT VALID;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_preferred_window_check CHECK (preferred_window IS NULL OR preferred_window IN ('overnight','morning','afternoon','evening','night')) NOT VALID;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_duration_type_check CHECK (duration_type IS NULL OR duration_type IN ('single_day','multi_day')) NOT VALID;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_duration_range_check CHECK (duration_end_date IS NULL OR duration_start_date IS NULL OR duration_end_date >= duration_start_date) NOT VALID;

GRANT SELECT (timing_type, preferred_window, duration_type, duration_start_date, duration_end_date) ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

CREATE OR REPLACE FUNCTION public.customer_create_booking(
  _submission_id uuid,
  _worker_id uuid,
  _worker_profession_id uuid,
  _category_id uuid,
  _description text,
  _address text,
  _service_area text,
  _scheduled_at timestamp with time zone,
  _estimated_cost integer,
  _budget integer,
  _urgency text,
  _latitude numeric,
  _longitude numeric,
  _photos jsonb DEFAULT '[]'::jsonb,
  _service_area_id uuid DEFAULT NULL::uuid,
  _timing_type text DEFAULT 'scheduled',
  _preferred_window text DEFAULT NULL,
  _duration_type text DEFAULT 'single_day',
  _duration_end_date date DEFAULT NULL
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
  _area_name text;
  _start_date date;
  _scheduled timestamptz;
BEGIN
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

  _timing_type := COALESCE(_timing_type, 'scheduled');
  IF _timing_type NOT IN ('asap','scheduled') THEN
    RAISE EXCEPTION 'Invalid timing';
  END IF;
  _duration_type := COALESCE(_duration_type, 'single_day');
  IF _duration_type NOT IN ('single_day','multi_day') THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;

  IF _timing_type = 'asap' THEN
    _preferred_window := NULL;
    _scheduled := now();
  ELSE
    IF _preferred_window IS NULL OR _preferred_window NOT IN ('overnight','morning','afternoon','evening','night') THEN
      RAISE EXCEPTION 'Please choose a preferred time window';
    END IF;
    IF _scheduled_at IS NULL THEN
      RAISE EXCEPTION 'Please choose a preferred date';
    END IF;
    _scheduled := _scheduled_at;
  END IF;

  IF _duration_type = 'multi_day' THEN
    _start_date := (_scheduled AT TIME ZONE 'UTC')::date;
    IF _duration_end_date IS NULL THEN
      RAISE EXCEPTION 'Please choose an end date';
    END IF;
    IF _duration_end_date < _start_date THEN
      RAISE EXCEPTION 'End date cannot be before the start date';
    END IF;
  ELSE
    _start_date := NULL;
    _duration_end_date := NULL;
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

  IF _service_area_id IS NOT NULL THEN
    SELECT sa.name INTO _area_name
    FROM public.service_areas sa
    JOIN public.worker_service_areas wsa
      ON wsa.service_area_id = sa.id AND wsa.worker_id = _worker_id
    WHERE sa.id = _service_area_id AND sa.is_active;
    IF _area_name IS NULL THEN
      RAISE EXCEPTION 'This professional does not currently serve that area.';
    END IF;
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
      description, address, service_area, service_area_id, scheduled_at, estimated_cost,
      budget, urgency, latitude, longitude, photos, submission_id,
      timing_type, preferred_window, duration_type, duration_start_date, duration_end_date
    ) VALUES (
      _customer_id, _worker_id, _worker_profession_id, _category_id,
      trim(_description), trim(_address), COALESCE(_area_name, trim(_service_area)), _service_area_id, _scheduled,
      _estimated_cost, _budget, _urgency, _latitude, _longitude,
      COALESCE(_photos, '[]'::jsonb), _submission_id,
      _timing_type, _preferred_window, _duration_type, _start_date, _duration_end_date
    )
    RETURNING bookings.id, bookings.photos;
  EXCEPTION
    WHEN lock_not_available OR query_canceled THEN
      RAISE EXCEPTION 'Booking is temporarily busy. Please retry.' USING ERRCODE = '55P03';
  END;
END
$function$;