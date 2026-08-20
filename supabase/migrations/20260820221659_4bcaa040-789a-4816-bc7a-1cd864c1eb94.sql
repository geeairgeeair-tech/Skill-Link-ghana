ALTER TABLE public.job_requests
  ADD COLUMN IF NOT EXISTS duration_type text,
  ADD COLUMN IF NOT EXISTS duration_start_date date,
  ADD COLUMN IF NOT EXISTS duration_end_date date;

ALTER TABLE public.job_requests
  ADD CONSTRAINT job_requests_duration_type_check
  CHECK (duration_type IS NULL OR duration_type IN ('single_day','multi_day'));

ALTER TABLE public.job_requests
  ADD CONSTRAINT job_requests_duration_range_check
  CHECK (
    duration_type IS DISTINCT FROM 'multi_day'
    OR (duration_start_date IS NOT NULL AND duration_end_date IS NOT NULL AND duration_end_date >= duration_start_date)
  );