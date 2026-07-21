
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
  preview := substring(COALESCE(NEW.content,'') from 1 for 120);
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (recipient, 'chat_message',
    COALESCE(sender_name,'New message'), preview,
    jsonb_build_object('booking_id', NEW.booking_id, 'message_id', NEW.id));
  RETURN NEW;
END;
$$;
