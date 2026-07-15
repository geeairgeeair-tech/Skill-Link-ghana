
-- worker_portfolio: showcase images/projects for each worker
CREATE TABLE public.worker_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.worker_profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_worker_portfolio_worker ON public.worker_portfolio(worker_id);

GRANT SELECT ON public.worker_portfolio TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.worker_portfolio TO authenticated;
GRANT ALL ON public.worker_portfolio TO service_role;

ALTER TABLE public.worker_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio public read" ON public.worker_portfolio
  FOR SELECT USING (true);
CREATE POLICY "Worker manages own portfolio" ON public.worker_portfolio
  FOR ALL TO authenticated
  USING (auth.uid() = worker_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = worker_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_worker_portfolio_updated
  BEFORE UPDATE ON public.worker_portfolio
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- notifications: per-user inbox for booking updates, messages, admin alerts
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all notifications" ON public.notifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_notifications_updated
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- Helpful indexes on existing FK columns (idempotent)
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_worker ON public.bookings(worker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_category ON public.bookings(category_id);
CREATE INDEX IF NOT EXISTS idx_reviews_worker ON public.reviews(worker_id);
CREATE INDEX IF NOT EXISTS idx_messages_booking ON public.messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_category ON public.worker_profiles(category_id);
CREATE INDEX IF NOT EXISTS idx_job_requests_customer ON public.job_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_requests_category ON public.job_requests(category_id);
