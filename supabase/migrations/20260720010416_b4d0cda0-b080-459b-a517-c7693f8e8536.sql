
-- Enforce category match at the database layer for job applications
DROP POLICY IF EXISTS "Approved worker inserts own application" ON public.job_applications;

CREATE POLICY "Approved worker in matching category inserts application"
ON public.job_applications
FOR INSERT
TO authenticated
WITH CHECK (
  worker_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    JOIN public.job_requests jr ON jr.id = job_applications.job_id
    WHERE wp.user_id = auth.uid()
      AND wp.verification_status = 'approved'::verification_status
      AND wp.category_id = jr.category_id
      AND jr.status = 'open'::job_request_status
  )
);
