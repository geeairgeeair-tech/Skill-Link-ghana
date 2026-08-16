DROP POLICY IF EXISTS "Worker updates own pending application" ON public.job_applications;

CREATE POLICY "Worker withdraws own pending application"
ON public.job_applications
FOR UPDATE
TO authenticated
USING (worker_id = auth.uid() AND status = 'pending'::job_application_status)
WITH CHECK (
  worker_id = auth.uid()
  AND status IN ('pending'::job_application_status, 'withdrawn'::job_application_status)
);