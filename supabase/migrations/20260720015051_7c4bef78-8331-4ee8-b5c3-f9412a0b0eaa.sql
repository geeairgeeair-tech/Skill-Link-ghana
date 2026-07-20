ALTER TYPE public.verification_status ADD VALUE IF NOT EXISTS 'suspended';

CREATE OR REPLACE FUNCTION public.admin_list_workers(_status text DEFAULT NULL::text)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  phone text,
  date_of_birth date,
  age integer,
  category_name text,
  service_area text,
  city text,
  years_experience integer,
  verification_status text,
  is_available boolean,
  subscription_expires_at timestamp with time zone,
  jobs_completed integer,
  rating numeric,
  reviews_count integer,
  avatar_url text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wp.user_id,
    p.full_name,
    u.email::text,
    p.phone,
    wp.date_of_birth,
    CASE WHEN wp.date_of_birth IS NULL THEN NULL
         ELSE EXTRACT(YEAR FROM age(wp.date_of_birth))::integer END,
    c.name,
    wp.service_area,
    wp.city,
    wp.years_experience,
    wp.verification_status::text,
    wp.is_available,
    wp.subscription_expires_at,
    wp.jobs_completed,
    wp.rating,
    wp.reviews_count,
    p.avatar_url,
    wp.created_at
  FROM public.worker_profiles wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  LEFT JOIN auth.users u ON u.id = wp.user_id
  LEFT JOIN public.categories c ON c.id = wp.category_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (_status IS NULL OR wp.verification_status::text = _status)
  ORDER BY wp.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  phone text,
  roles text[],
  created_at timestamp with time zone,
  verification_status text,
  is_suspended boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = p.id), ARRAY[]::text[]),
    p.created_at,
    wp.verification_status::text,
    (wp.verification_status::text = 'suspended')
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.worker_profiles wp ON wp.user_id = p.id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC;
$$;