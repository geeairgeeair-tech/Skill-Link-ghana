
-- Owner check helper: first storage folder segment must equal the owner id
CREATE OR REPLACE FUNCTION public.media_path_owned_by(_path text, _owner uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _path IS NOT NULL
     AND _owner IS NOT NULL
     AND position('/' in _path) > 1
     AND split_part(_path, '/', 1) = _owner::text
$$;

-- Extract path from either a bare string element or an object element
CREATE OR REPLACE FUNCTION public.media_element_path(_item jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(_item) = 'string' THEN _item #>> '{}'
    WHEN jsonb_typeof(_item) = 'object' THEN _item ->> 'path'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.media_array_owned_by(_arr jsonb, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(COALESCE(_arr,'[]'::jsonb)) = 'array'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(_arr,'[]'::jsonb)) it
       WHERE public.media_element_path(it) IS NULL
          OR NOT public.media_path_owned_by(public.media_element_path(it), _owner)
     )
$$;

-- 1) Chat attachments must live in the sender's own storage folder
CREATE OR REPLACE FUNCTION public.guard_message_attachment_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.attachment_url IS NULL OR NEW.attachment_url = '' THEN
    RETURN NEW;
  END IF;
  -- only enforce for ordinary API callers
  IF current_setting('role', true) IN ('authenticated','anon')
     OR current_user IN ('authenticated','anon') THEN
    IF NOT public.media_path_owned_by(NEW.attachment_url, NEW.sender_id) THEN
      RAISE EXCEPTION 'Attachment must be a file you uploaded';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_message_attachment_owner ON public.messages;
CREATE TRIGGER trg_guard_message_attachment_owner
BEFORE INSERT OR UPDATE OF attachment_url ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_attachment_owner();

-- 2) Booking progress/completion photos must belong to the submitting worker
CREATE OR REPLACE FUNCTION public.booking_add_photos(_booking_id uuid, _kind text, _urls jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings%ROWTYPE;
  n_added int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('progress','completion') THEN RAISE EXCEPTION 'Invalid photo kind'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF NOT public.media_array_owned_by(_urls, auth.uid()) THEN
    RAISE EXCEPTION 'Photos must be files you uploaded';
  END IF;

  PERFORM set_config('app.booking_rpc','on',true);

  n_added := COALESCE(jsonb_array_length(COALESCE(_urls,'[]'::jsonb)), 0);

  IF _kind = 'progress' THEN
    UPDATE public.bookings SET progress_photos = COALESCE(progress_photos,'[]'::jsonb) || COALESCE(_urls,'[]'::jsonb) WHERE id = _booking_id;
  ELSE
    UPDATE public.bookings SET completion_photos = COALESCE(completion_photos,'[]'::jsonb) || COALESCE(_urls,'[]'::jsonb) WHERE id = _booking_id;
  END IF;

  IF n_added > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      b.customer_id,
      CASE WHEN _kind = 'progress' THEN 'booking_progress_photo' ELSE 'booking_completion_photo' END,
      CASE WHEN _kind = 'progress' THEN 'Work in Progress photo added' ELSE 'Work Completion photo added' END,
      CASE WHEN _kind = 'progress'
        THEN 'Your professional uploaded a Work in Progress photo.'
        ELSE 'Your professional uploaded a Work Completion photo.' END,
      jsonb_build_object('booking_id', _booking_id, 'kind', _kind, 'count', n_added)
    );
  END IF;
END $function$;

-- 3) Return-request photos must belong to the requesting customer
CREATE OR REPLACE FUNCTION public.guard_return_request_photos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.media_array_owned_by(NEW.photos, NEW.customer_id) THEN
    RAISE EXCEPTION 'Photos must be files you uploaded';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_return_request_photos ON public.return_requests;
CREATE TRIGGER trg_guard_return_request_photos
BEFORE INSERT OR UPDATE OF photos ON public.return_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_return_request_photos();
