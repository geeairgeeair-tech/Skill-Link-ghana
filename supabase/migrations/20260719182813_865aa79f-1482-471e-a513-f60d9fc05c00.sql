
-- Extend job_request_status with the customer lifecycle values
ALTER TYPE public.job_request_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.job_request_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.job_request_status ADD VALUE IF NOT EXISTS 'completed';

-- Urgency enum
DO $$ BEGIN
  CREATE TYPE public.job_urgency AS ENUM ('normal','urgent','emergency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- New columns for job scheduling / geo
ALTER TABLE public.job_requests
  ADD COLUMN IF NOT EXISTS urgency public.job_urgency NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS preferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS service_area text;

-- Ensure customers can also see their own drafts (existing SELECT policy already covers customer_id = auth.uid())
