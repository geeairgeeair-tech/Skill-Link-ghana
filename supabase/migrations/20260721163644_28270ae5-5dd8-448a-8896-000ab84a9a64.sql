
-- 1. Decline metadata on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS decline_note text,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

-- 2. Secure decline RPC. Only the assigned worker can decline while pending.
CREATE OR REPLACE FUNCTION public.worker_decline_booking(
  _booking_id uuid,
  _reason_code text,
  _reason_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  allowed text[] := ARRAY[
    'schedule_conflict','too_far','budget_low','no_equipment',
    'unavailable','unclear_details','safety_concern','wrong_category','other'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason_code IS NULL OR NOT (_reason_code = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid decline reason';
  END IF;
  IF _reason_code = 'other' AND (COALESCE(trim(_reason_note),'') = '') THEN
    RAISE EXCEPTION 'Please explain your reason';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'pending'::booking_status THEN RAISE EXCEPTION 'Only pending bookings can be declined'; END IF;

  UPDATE public.bookings
    SET status = 'declined'::booking_status,
        decline_reason = _reason_code,
        decline_note = NULLIF(trim(COALESCE(_reason_note,'')), ''),
        declined_at = now()
    WHERE id = _booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.worker_decline_booking(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_decline_booking(uuid, text, text) TO authenticated;

-- 3. Enrich booking decline notification with the reason
CREATE OR REPLACE FUNCTION public.notify_booking_events()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  customer_name text;
  worker_name text;
  reason_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.worker_id, 'booking_request', 'New booking request',
      COALESCE(customer_name, 'A customer') || ' requested your service',
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO worker_name FROM public.profiles WHERE id = NEW.worker_id;
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_accepted', 'Booking accepted',
        COALESCE(worker_name,'The worker') || ' accepted your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));
    ELSIF NEW.status = 'declined' THEN
      reason_label := CASE NEW.decline_reason
        WHEN 'schedule_conflict' THEN 'Schedule conflict'
        WHEN 'too_far' THEN 'Too far from service area'
        WHEN 'budget_low' THEN 'Budget is too low'
        WHEN 'no_equipment' THEN 'Missing required equipment'
        WHEN 'unavailable' THEN 'Currently unavailable'
        WHEN 'unclear_details' THEN 'Job details are unclear'
        WHEN 'safety_concern' THEN 'Safety concern'
        WHEN 'wrong_category' THEN 'Wrong category or service'
        WHEN 'other' THEN 'Other'
        ELSE NULL END;
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_declined', 'Booking declined',
        COALESCE(worker_name,'The worker') || ' declined your booking'
          || CASE WHEN reason_label IS NOT NULL THEN ' — ' || reason_label ELSE '' END,
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status,
          'reason_code', NEW.decline_reason, 'reason_label', reason_label,
          'reason_note', NEW.decline_note));
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' AND auth.uid() = NEW.worker_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_declined', 'Booking cancelled',
        COALESCE(worker_name,'The worker') || ' cancelled your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Chat message notifications (recipient only, no duplicates)
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  recipient uuid;
  sender_name text;
  preview text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.sender_id = b.customer_id THEN recipient := b.worker_id;
  ELSIF NEW.sender_id = b.worker_id THEN recipient := b.customer_id;
  ELSE RETURN NEW; END IF;
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  preview := substring(COALESCE(NEW.body,'') from 1 for 120);
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (recipient, 'chat_message',
    COALESCE(sender_name,'New message'), preview,
    jsonb_build_object('booking_id', NEW.booking_id, 'message_id', NEW.id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- 5. Avatars storage policies (private bucket, signed URLs)
CREATE POLICY "Avatars readable to all"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Owner can upload avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Owner can update avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Owner can delete avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);
