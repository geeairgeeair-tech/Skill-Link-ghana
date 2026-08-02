-- Backfill: any worker profile with a trade but no profession row gets one
INSERT INTO public.worker_professions (
  user_id, category_id, bio, years_experience, portfolio_images, certificates,
  verification_status, is_primary, starting_price, callout_fee, submitted_at
)
SELECT wp.user_id, wp.category_id, wp.bio, wp.years_experience,
       COALESCE(wp.portfolio_images, '[]'::jsonb), '[]'::jsonb,
       CASE wp.verification_status::text
         WHEN 'approved' THEN 'approved'
         WHEN 'rejected' THEN 'rejected'
         WHEN 'suspended' THEN 'rejected'
         ELSE 'pending' END,
       true, wp.starting_price, wp.callout_fee, COALESCE(wp.created_at, now())
FROM public.worker_profiles wp
WHERE wp.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.worker_professions p WHERE p.user_id = wp.user_id);

-- Keep both signup paths identical going forward
CREATE OR REPLACE FUNCTION public.sync_primary_profession()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.worker_professions p WHERE p.user_id = NEW.user_id) THEN
    INSERT INTO public.worker_professions (
      user_id, category_id, bio, years_experience, portfolio_images, certificates,
      verification_status, is_primary, starting_price, callout_fee, submitted_at
    ) VALUES (
      NEW.user_id, NEW.category_id, NEW.bio, NEW.years_experience,
      COALESCE(NEW.portfolio_images, '[]'::jsonb), '[]'::jsonb,
      CASE NEW.verification_status::text
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'suspended' THEN 'rejected'
        ELSE 'pending' END,
      true, NEW.starting_price, NEW.callout_fee, now()
    );
  ELSIF TG_OP = 'UPDATE'
        AND NEW.verification_status IS DISTINCT FROM OLD.verification_status
        AND NEW.verification_status::text = 'approved' THEN
    UPDATE public.worker_professions
       SET verification_status = 'approved', reviewed_at = now(), updated_at = now()
     WHERE user_id = NEW.user_id
       AND is_primary
       AND verification_status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_primary_profession_trg ON public.worker_profiles;
CREATE TRIGGER sync_primary_profession_trg
AFTER INSERT OR UPDATE ON public.worker_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_primary_profession();