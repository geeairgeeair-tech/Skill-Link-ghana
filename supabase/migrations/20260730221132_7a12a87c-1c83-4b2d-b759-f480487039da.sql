-- 1) Remove obsolete duplicate confirmation function (keep 7-arg canonical)
DROP FUNCTION IF EXISTS public.customer_confirm_booking_completion(uuid, numeric, integer, text, boolean, text);

-- 2) Document expiry tracking
ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS documents_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_expire_at date,
  ADD COLUMN IF NOT EXISTS documents_last_reminder_days integer,
  ADD COLUMN IF NOT EXISTS documents_resubmission_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_resubmission_reason text;

-- 3) Admin: workers with expiring/expired documents
CREATE OR REPLACE FUNCTION public.admin_list_expiring_documents(_within_days integer DEFAULT 30)
RETURNS TABLE(user_id uuid, full_name text, verification_status text, documents_submitted_at timestamptz,
              documents_expire_at date, days_left integer, resubmission_requested_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT wp.user_id, p.full_name, wp.verification_status::text, wp.documents_submitted_at,
         wp.documents_expire_at,
         (wp.documents_expire_at - CURRENT_DATE)::int,
         wp.documents_resubmission_requested_at
  FROM public.worker_profiles wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND wp.documents_expire_at IS NOT NULL
    AND wp.documents_expire_at <= (CURRENT_DATE + COALESCE(_within_days, 30))
  ORDER BY wp.documents_expire_at ASC;
$$;

-- 4) Admin requests updated documents
CREATE OR REPLACE FUNCTION public.admin_request_document_resubmission(_user_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.worker_profiles
    SET documents_resubmission_requested_at = now(),
        documents_resubmission_reason = NULLIF(trim(COALESCE(_reason,'')),'')
    WHERE user_id = _user_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (_user_id, 'documents_resubmission_requested', 'Updated documents required',
    COALESCE(NULLIF(trim(COALESCE(_reason,'')),''), 'An admin has requested updated verification documents.'),
    jsonb_build_object('worker_id', _user_id));
  INSERT INTO public.admin_audit_logs(admin_id, action, target_user_id, target_type, details)
  VALUES (auth.uid(), 'document_resubmission_requested', _user_id, 'worker', jsonb_build_object('reason', _reason));
END $$;

-- 5) Expiry reminders to admins (30 / 14 / 7 / 0 days)
CREATE OR REPLACE FUNCTION public.send_document_expiry_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; a record; d int; window_days int; sent int := 0;
BEGIN
  FOR r IN SELECT wp.user_id, wp.documents_expire_at, wp.documents_last_reminder_days, p.full_name
           FROM public.worker_profiles wp LEFT JOIN public.profiles p ON p.id = wp.user_id
           WHERE wp.documents_expire_at IS NOT NULL
             AND wp.documents_expire_at <= (CURRENT_DATE + 30)
  LOOP
    d := (r.documents_expire_at - CURRENT_DATE)::int;
    window_days := CASE WHEN d <= 0 THEN 0 WHEN d <= 7 THEN 7 WHEN d <= 14 THEN 14 ELSE 30 END;
    IF r.documents_last_reminder_days IS NULL OR r.documents_last_reminder_days > window_days THEN
      FOR a IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (a.user_id, 'documents_expiring',
          CASE WHEN window_days = 0 THEN 'Worker documents expired' ELSE 'Worker documents expiring soon' END,
          COALESCE(r.full_name,'A worker') || ' — documents ' ||
            CASE WHEN d <= 0 THEN 'expired on ' ELSE 'expire on ' END || r.documents_expire_at::text,
          jsonb_build_object('worker_id', r.user_id, 'days_left', d));
      END LOOP;
      UPDATE public.worker_profiles SET documents_last_reminder_days = window_days WHERE user_id = r.user_id;
      sent := sent + 1;
    END IF;
  END LOOP;
  RETURN sent;
END $$;