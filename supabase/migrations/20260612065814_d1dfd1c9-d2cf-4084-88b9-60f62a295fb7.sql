
-- New category
INSERT INTO public.categories (slug, name, icon, sort_order, active)
VALUES ('pool-builder','Pool Builder','waves', 11, true)
ON CONFLICT (slug) DO NOTHING;

-- job_requests table
CREATE TYPE public.job_request_status AS ENUM ('open','assigned','closed','cancelled');

CREATE TABLE public.job_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  city text,
  address text,
  budget integer,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.job_request_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_requests TO authenticated;
GRANT ALL ON public.job_requests TO service_role;

ALTER TABLE public.job_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view open job requests"
  ON public.job_requests FOR SELECT TO authenticated
  USING (status = 'open' OR customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Customer can insert own job request"
  ON public.job_requests FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customer can update own job request"
  ON public.job_requests FOR UPDATE TO authenticated
  USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customer or admin can delete job request"
  ON public.job_requests FOR DELETE TO authenticated
  USING (customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_job_requests_updated_at
  BEFORE UPDATE ON public.job_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies for job-media bucket
CREATE POLICY "Anyone can read job media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-media');

CREATE POLICY "Authenticated can upload own job media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners can delete own job media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'job-media' AND (storage.foldername(name))[1] = auth.uid()::text);
