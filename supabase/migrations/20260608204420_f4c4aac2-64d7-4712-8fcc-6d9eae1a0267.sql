
-- Roles enum + user_roles table (separate, security-definer check)
CREATE TYPE public.app_role AS ENUM ('customer','worker','admin');
CREATE TYPE public.verification_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.booking_status AS ENUM ('pending','accepted','on_the_way','in_progress','completed','cancelled');
CREATE TYPE public.subscription_plan AS ENUM ('basic','premium','elite');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  city TEXT DEFAULT 'Accra',
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are public readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.categories TO authenticated, anon;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories public read" ON public.categories FOR SELECT USING (true);

-- worker_profiles
CREATE TABLE public.worker_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id),
  bio TEXT,
  years_experience INT DEFAULT 0,
  ghana_card_number TEXT,
  ghana_card_url TEXT,
  selfie_url TEXT,
  city TEXT DEFAULT 'Accra',
  service_area TEXT DEFAULT 'Accra',
  hourly_rate INT DEFAULT 0,
  callout_fee INT DEFAULT 0,
  starting_price INT DEFAULT 0,
  portfolio_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  subscription_plan subscription_plan,
  subscription_expires_at TIMESTAMPTZ,
  rating NUMERIC(2,1) DEFAULT 0,
  reviews_count INT DEFAULT 0,
  jobs_completed INT DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.worker_profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.worker_profiles TO authenticated;
GRANT ALL ON public.worker_profiles TO service_role;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
-- Public can see only verified + active-subscribed workers
CREATE POLICY "Public sees verified+subscribed workers" ON public.worker_profiles FOR SELECT
  USING (
    verification_status = 'approved'
    AND subscription_expires_at IS NOT NULL
    AND subscription_expires_at > now()
  );
CREATE POLICY "Worker reads own profile" ON public.worker_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Worker upserts own profile" ON public.worker_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Worker updates own profile" ON public.worker_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin manages worker profiles" ON public.worker_profiles FOR ALL USING (public.has_role(auth.uid(),'admin'));

-- bookings
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id),
  description TEXT NOT NULL DEFAULT '',
  address TEXT,
  scheduled_at TIMESTAMPTZ,
  estimated_cost INT,
  status booking_status NOT NULL DEFAULT 'pending',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties view booking" ON public.bookings FOR SELECT
  USING (auth.uid() = customer_id OR auth.uid() = worker_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customer creates booking" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Parties update booking" ON public.bookings FOR UPDATE
  USING (auth.uid() = customer_id OR auth.uid() = worker_id OR public.has_role(auth.uid(),'admin'));

-- reviews
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews public read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Customer writes review" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Booking parties read messages" ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.worker_id = auth.uid())));
CREATE POLICY "Booking parties send messages" ON public.messages FOR INSERT
  WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.worker_id = auth.uid())));

-- platform_settings (commission etc)
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings public read" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admin manages settings" ON public.platform_settings FOR ALL USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.platform_settings (key, value) VALUES
  ('commission_pct', '10'::jsonb),
  ('subscription_prices', '{"basic":50,"premium":100,"elite":200}'::jsonb);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_worker_profiles_updated BEFORE UPDATE ON public.worker_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- handle_new_user trigger: create profile + default customer role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'customer'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update rating after review
CREATE OR REPLACE FUNCTION public.update_worker_rating()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.worker_profiles
  SET rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.reviews WHERE worker_id = NEW.worker_id),
      reviews_count = (SELECT COUNT(*) FROM public.reviews WHERE worker_id = NEW.worker_id)
  WHERE user_id = NEW.worker_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_review_rating AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_worker_rating();

-- Seed categories (Accra MVP focus + a few extras)
INSERT INTO public.categories (slug,name,icon,sort_order) VALUES
  ('electrician','Electrician','Zap',1),
  ('plumber','Plumber','Wrench',2),
  ('carpenter','Carpenter','Hammer',3),
  ('painter','Painter','PaintBucket',4),
  ('ac-tech','AC Technician','Wind',5),
  ('welder','Welder','Flame',6),
  ('mason','Mason','Bricks',7),
  ('cctv','CCTV Installer','Camera',8),
  ('mechanic','Mechanic','Car',9),
  ('cleaner','Cleaner','Sparkles',10);

-- Enable realtime for messages and bookings
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
