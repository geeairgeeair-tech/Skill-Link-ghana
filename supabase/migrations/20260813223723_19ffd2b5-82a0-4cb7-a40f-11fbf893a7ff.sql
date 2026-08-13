-- 1. Canonical service areas catalogue
CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  launch_zone text NOT NULL,
  region text NOT NULL DEFAULT 'Greater Accra',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_areas_slug_key UNIQUE (slug),
  CONSTRAINT service_areas_name_zone_key UNIQUE (launch_zone, name)
);

GRANT SELECT ON public.service_areas TO anon;
GRANT SELECT ON public.service_areas TO authenticated;
GRANT ALL ON public.service_areas TO service_role;

ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active service areas"
  ON public.service_areas FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins manage service areas"
  ON public.service_areas FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER service_areas_touch_updated_at
  BEFORE UPDATE ON public.service_areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX service_areas_active_sort_idx ON public.service_areas (is_active, launch_zone, sort_order);

-- 2. Professional <-> service area relationship
CREATE TABLE public.worker_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_area_id uuid NOT NULL REFERENCES public.service_areas(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_service_areas_unique UNIQUE (worker_id, service_area_id)
);

-- at most one primary area per professional
CREATE UNIQUE INDEX worker_service_areas_one_primary_idx
  ON public.worker_service_areas (worker_id) WHERE is_primary;

CREATE INDEX worker_service_areas_area_idx ON public.worker_service_areas (service_area_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_service_areas TO authenticated;
GRANT SELECT ON public.worker_service_areas TO anon;
GRANT ALL ON public.worker_service_areas TO service_role;

ALTER TABLE public.worker_service_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service area coverage is public"
  ON public.worker_service_areas FOR SELECT
  USING (true);

CREATE POLICY "Workers insert their own service areas"
  ON public.worker_service_areas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = worker_id);

CREATE POLICY "Workers update their own service areas"
  ON public.worker_service_areas FOR UPDATE
  TO authenticated
  USING (auth.uid() = worker_id)
  WITH CHECK (auth.uid() = worker_id);

CREATE POLICY "Workers delete their own service areas"
  ON public.worker_service_areas FOR DELETE
  TO authenticated
  USING (auth.uid() = worker_id);

CREATE TRIGGER worker_service_areas_touch_updated_at
  BEFORE UPDATE ON public.worker_service_areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- max 8 areas per professional + only active areas selectable
CREATE OR REPLACE FUNCTION public.enforce_worker_service_area_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  area_count integer;
  area_active boolean;
BEGIN
  SELECT is_active INTO area_active FROM public.service_areas WHERE id = NEW.service_area_id;
  IF area_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'That service area is not available for selection';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.worker_id <> OLD.worker_id THEN
    SELECT count(*) INTO area_count
    FROM public.worker_service_areas
    WHERE worker_id = NEW.worker_id;
    IF area_count >= 8 THEN
      RAISE EXCEPTION 'A professional can cover at most 8 service areas (1 primary + 7 additional)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER worker_service_areas_limit
  BEFORE INSERT OR UPDATE ON public.worker_service_areas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_worker_service_area_limit();

-- 3. Jobs reference one canonical service area (additive, nullable)
ALTER TABLE public.job_requests
  ADD COLUMN service_area_id uuid REFERENCES public.service_areas(id) ON DELETE SET NULL;

CREATE INDEX job_requests_service_area_idx ON public.job_requests (service_area_id);

-- 4. Seed launch catalogue
INSERT INTO public.service_areas (name, slug, launch_zone, region, sort_order) VALUES
  ('Accra Central', 'accra-central', 'Greater Accra', 'Greater Accra', 10),
  ('Osu', 'osu', 'Greater Accra', 'Greater Accra', 20),
  ('Labone', 'labone', 'Greater Accra', 'Greater Accra', 30),
  ('Cantonments', 'cantonments', 'Greater Accra', 'Greater Accra', 40),
  ('Airport Residential', 'airport-residential', 'Greater Accra', 'Greater Accra', 50),
  ('East Legon', 'east-legon', 'Greater Accra', 'Greater Accra', 60),
  ('Adjiringanor', 'adjiringanor', 'Greater Accra', 'Greater Accra', 70),
  ('Madina', 'madina', 'Greater Accra', 'Greater Accra', 80),
  ('Adenta', 'adenta', 'Greater Accra', 'Greater Accra', 90),
  ('Haatso', 'haatso', 'Greater Accra', 'Greater Accra', 100),
  ('Legon', 'legon', 'Greater Accra', 'Greater Accra', 110),
  ('Achimota', 'achimota', 'Greater Accra', 'Greater Accra', 120),
  ('Dome', 'dome', 'Greater Accra', 'Greater Accra', 130),
  ('Kwabenya', 'kwabenya', 'Greater Accra', 'Greater Accra', 140),
  ('Taifa', 'taifa', 'Greater Accra', 'Greater Accra', 150),
  ('Dansoman', 'dansoman', 'Greater Accra', 'Greater Accra', 160),
  ('Kaneshie', 'kaneshie', 'Greater Accra', 'Greater Accra', 170),
  ('Abeka', 'abeka', 'Greater Accra', 'Greater Accra', 180),
  ('Lapaz', 'lapaz', 'Greater Accra', 'Greater Accra', 190),
  ('Tesano', 'tesano', 'Greater Accra', 'Greater Accra', 200),
  ('Dzorwulu', 'dzorwulu', 'Greater Accra', 'Greater Accra', 210),
  ('Abelemkpe', 'abelemkpe', 'Greater Accra', 'Greater Accra', 220),
  ('Roman Ridge', 'roman-ridge', 'Greater Accra', 'Greater Accra', 230),
  ('Spintex', 'spintex', 'Greater Accra', 'Greater Accra', 240),
  ('Teshie', 'teshie', 'Greater Accra', 'Greater Accra', 250),
  ('Nungua', 'nungua', 'Greater Accra', 'Greater Accra', 260),
  ('La', 'la', 'Greater Accra', 'Greater Accra', 270),
  ('Ashaiman', 'ashaiman', 'Greater Accra', 'Greater Accra', 280),
  ('Amasaman', 'amasaman', 'Greater Accra', 'Greater Accra', 290),
  ('Pokuase', 'pokuase', 'Greater Accra', 'Greater Accra', 300),
  ('Ofankor', 'ofankor', 'Greater Accra', 'Greater Accra', 310),
  ('Weija', 'weija', 'Greater Accra', 'Greater Accra', 320),
  ('Mallam', 'mallam', 'Greater Accra', 'Greater Accra', 330),
  ('Odorkor', 'odorkor', 'Greater Accra', 'Greater Accra', 340),
  ('Sakumono', 'sakumono', 'Greater Accra', 'Greater Accra', 350),
  ('Tema Community 1', 'tema-community-1', 'Tema', 'Greater Accra', 400),
  ('Tema Community 2', 'tema-community-2', 'Tema', 'Greater Accra', 410),
  ('Tema Community 3', 'tema-community-3', 'Tema', 'Greater Accra', 420),
  ('Tema Community 4', 'tema-community-4', 'Tema', 'Greater Accra', 430),
  ('Tema Community 5', 'tema-community-5', 'Tema', 'Greater Accra', 440),
  ('Tema Community 6', 'tema-community-6', 'Tema', 'Greater Accra', 450),
  ('Tema Community 7', 'tema-community-7', 'Tema', 'Greater Accra', 460),
  ('Tema Community 8', 'tema-community-8', 'Tema', 'Greater Accra', 470),
  ('Tema Community 9', 'tema-community-9', 'Tema', 'Greater Accra', 480),
  ('Tema Community 10', 'tema-community-10', 'Tema', 'Greater Accra', 490),
  ('Tema Community 11', 'tema-community-11', 'Tema', 'Greater Accra', 500),
  ('Tema Community 12', 'tema-community-12', 'Tema', 'Greater Accra', 510),
  ('Tema Community 25', 'tema-community-25', 'Tema', 'Greater Accra', 520),
  ('Tema Newtown', 'tema-newtown', 'Tema', 'Greater Accra', 530),
  ('Tema Industrial Area', 'tema-industrial-area', 'Tema', 'Greater Accra', 540),
  ('Kasoa Central', 'kasoa-central', 'Kasoa', 'Central', 600),
  ('Ofaakor', 'ofaakor', 'Kasoa', 'Central', 610),
  ('Amanfrom', 'amanfrom', 'Kasoa', 'Central', 620),
  ('Opeikuma', 'opeikuma', 'Kasoa', 'Central', 630),
  ('Iron City', 'iron-city', 'Kasoa', 'Central', 640),
  ('Millennium City', 'millennium-city', 'Kasoa', 'Central', 650),
  ('Akweley', 'akweley', 'Kasoa', 'Central', 660),
  ('Nyanyano Road', 'nyanyano-road', 'Kasoa', 'Central', 670);
