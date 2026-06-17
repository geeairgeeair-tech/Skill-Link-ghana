INSERT INTO public.categories (slug, name, icon, sort_order, active)
SELECT 'dispatch-rider', 'Dispatch Rider', 'Bike', 100, true
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Dispatch Rider');

INSERT INTO public.categories (slug, name, icon, sort_order, active)
SELECT 'private-teacher', 'Private Teacher', 'GraduationCap', 101, true
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Private Teacher');