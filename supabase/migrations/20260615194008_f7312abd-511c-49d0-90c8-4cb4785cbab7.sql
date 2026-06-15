
INSERT INTO public.categories (name, slug, icon) VALUES
  ('Nanny','nanny','Baby'),
  ('Driver','driver','Car')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_jobs_completed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.worker_profiles
      SET jobs_completed = COALESCE(jobs_completed,0) + 1
      WHERE user_id = NEW.worker_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bump_jobs_completed ON public.bookings;
CREATE TRIGGER trg_bump_jobs_completed
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bump_jobs_completed();

-- Backfill counts
UPDATE public.worker_profiles wp
SET jobs_completed = sub.cnt
FROM (
  SELECT worker_id, COUNT(*)::int AS cnt
  FROM public.bookings WHERE status='completed' GROUP BY worker_id
) sub
WHERE wp.user_id = sub.worker_id;

-- Allow admins to view worker identity documents via the same RPC (function already checks role).
-- Ensure messages realtime publication includes messages (idempotent)
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;
