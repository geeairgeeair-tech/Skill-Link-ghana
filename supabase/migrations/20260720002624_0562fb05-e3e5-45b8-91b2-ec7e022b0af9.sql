
CREATE TYPE public.job_application_status AS ENUM ('pending','withdrawn','accepted','rejected');

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.job_requests(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quoted_price integer NOT NULL CHECK (quoted_price >= 0),
  estimated_start timestamptz,
  message text,
  status public.job_application_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, worker_id)
);

CREATE INDEX idx_job_applications_job ON public.job_applications(job_id);
CREATE INDEX idx_job_applications_worker ON public.job_applications(worker_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Worker: only approved workers can insert, only for themselves, only for open jobs
CREATE POLICY "Approved worker inserts own application"
  ON public.job_applications FOR INSERT TO authenticated
  WITH CHECK (
    worker_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.worker_profiles wp
      WHERE wp.user_id = auth.uid()
        AND wp.verification_status = 'approved'
    )
    AND EXISTS (
      SELECT 1 FROM public.job_requests jr
      WHERE jr.id = job_id AND jr.status = 'open'
    )
  );

-- Worker sees own applications; Customer sees applications on their jobs; Admin sees all
CREATE POLICY "View own or job-owner applications"
  ON public.job_applications FOR SELECT TO authenticated
  USING (
    worker_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.job_requests jr WHERE jr.id = job_id AND jr.customer_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Worker can update/withdraw only their own pending application
CREATE POLICY "Worker updates own pending application"
  ON public.job_applications FOR UPDATE TO authenticated
  USING (worker_id = auth.uid() AND status = 'pending')
  WITH CHECK (worker_id = auth.uid());

-- Worker can delete own pending application
CREATE POLICY "Worker deletes own pending application"
  ON public.job_applications FOR DELETE TO authenticated
  USING (worker_id = auth.uid() AND status = 'pending');

-- Admin full control
CREATE POLICY "Admin manages applications"
  ON public.job_applications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_job_applications_touch
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
