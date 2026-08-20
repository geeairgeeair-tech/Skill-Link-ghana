
CREATE OR REPLACE FUNCTION public.guard_worker_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  is_trusted boolean;
BEGIN
  is_trusted := (current_user NOT IN ('authenticated','anon'))
                OR coalesce(current_setting('app.worker_profile_rpc', true), '') = 'on'
                OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'));

  IF is_trusted THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.rejection_reason := NULL;
    NEW.rejected_at := NULL;
    NEW.documents_submitted_at := NULL;
    NEW.documents_expire_at := NULL;
    NEW.documents_last_reminder_days := NULL;
    NEW.documents_resubmission_requested_at := NULL;
    NEW.documents_resubmission_reason := NULL;
    NEW.is_featured := false;
    NEW.subscription_plan := NULL;
    NEW.subscription_expires_at := NULL;
    NEW.rating := NULL;
    NEW.reviews_count := 0;
    NEW.jobs_completed := 0;
    NEW.phone_verified := false;
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.documents_submitted_at IS DISTINCT FROM OLD.documents_submitted_at
     OR NEW.documents_expire_at IS DISTINCT FROM OLD.documents_expire_at
     OR NEW.documents_last_reminder_days IS DISTINCT FROM OLD.documents_last_reminder_days
     OR NEW.documents_resubmission_requested_at IS DISTINCT FROM OLD.documents_resubmission_requested_at
     OR NEW.documents_resubmission_reason IS DISTINCT FROM OLD.documents_resubmission_reason
     OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.reviews_count IS DISTINCT FROM OLD.reviews_count
     OR NEW.jobs_completed IS DISTINCT FROM OLD.jobs_completed
     OR NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
     OR NEW.ghana_card_number IS DISTINCT FROM OLD.ghana_card_number
     OR NEW.ghana_card_url IS DISTINCT FROM OLD.ghana_card_url
     OR NEW.selfie_url IS DISTINCT FROM OLD.selfie_url
     OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not allowed: verification, identity, rating, subscription and featured fields are managed by Skill Link.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
