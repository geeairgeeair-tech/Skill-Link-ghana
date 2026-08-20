ALTER TABLE public.job_requests
  ADD COLUMN IF NOT EXISTS timing_type text NOT NULL DEFAULT 'asap',
  ADD COLUMN IF NOT EXISTS preferred_window text;

UPDATE public.job_requests SET timing_type = 'scheduled' WHERE preferred_at IS NOT NULL;

ALTER TABLE public.job_requests
  ADD CONSTRAINT job_requests_timing_type_check CHECK (timing_type IN ('asap','scheduled'));

ALTER TABLE public.job_requests
  ADD CONSTRAINT job_requests_preferred_window_check CHECK (preferred_window IS NULL OR preferred_window IN ('overnight','morning','afternoon','evening','night'));

GRANT SELECT (timing_type, preferred_window) ON public.job_requests TO authenticated, anon;
GRANT INSERT (timing_type, preferred_window), UPDATE (timing_type, preferred_window) ON public.job_requests TO authenticated;