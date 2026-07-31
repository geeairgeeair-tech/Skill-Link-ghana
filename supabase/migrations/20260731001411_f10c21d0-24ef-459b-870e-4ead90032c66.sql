-- 1. Category metadata
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS group_name text NOT NULL DEFAULT 'Other Services',
  ADD COLUMN IF NOT EXISTS return_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_admin_approval boolean NOT NULL DEFAULT false;

-- 2. New categories (idempotent on slug)
INSERT INTO public.categories (slug, name, icon, sort_order, active, group_name, return_eligible, requires_admin_approval) VALUES
 ('fridge-tech','Refrigerator & Cold Room Technician','Snowflake',12,true,'Home Repair & Technical Services',true,false),
 ('appliance-repair','Appliance Repair Technician','Plug',13,true,'Home Repair & Technical Services',true,false),
 ('dstv-installer','Satellite & DSTV Installer','Satellite',14,true,'Home Repair & Technical Services',true,false),
 ('handyman','General Handyman','Wrench',15,true,'Home Repair & Technical Services',true,false),
 ('private-driver','Private Driver','Car',20,true,'Transportation & Delivery',false,false),
 ('delivery-rider','Delivery Rider','Bike',21,true,'Transportation & Delivery',false,false),
 ('truck-driver','Truck Driver','Truck',22,true,'Transportation & Delivery',false,false),
 ('heavy-goods-driver','Heavy-Goods & Moving Truck Driver','Truck',23,true,'Transportation & Delivery',false,false),
 ('moving-haulage','Moving & Haulage Services','PackageOpen',24,true,'Transportation & Delivery',false,false),
 ('housekeeper','Housekeeper','Home',31,true,'Home & Personal Support',false,false),
 ('caregiver','Caregiver','HeartHandshake',32,true,'Home & Personal Support',false,false),
 ('private-nurse','Private Nurse','Stethoscope',33,true,'Home & Personal Support',false,true),
 ('private-doctor','Private Doctor','BriefcaseMedical',34,true,'Home & Personal Support',false,true),
 ('massage-therapist','Massage Therapist','Hand',35,true,'Home & Personal Support',false,false),
 ('chef','Chef','ChefHat',40,true,'Food & Hospitality',false,false),
 ('caterer','Caterer','UtensilsCrossed',41,true,'Food & Hospitality',false,false),
 ('event-caterer','Large-Event Caterer','UtensilsCrossed',42,true,'Food & Hospitality',false,false),
 ('waiter','Waiter','ConciergeBell',43,true,'Food & Hospitality',false,false),
 ('waitress','Waitress','ConciergeBell',44,true,'Food & Hospitality',false,false),
 ('bartender','Bartender','Martini',45,true,'Food & Hospitality',false,false),
 ('event-staff','Event Service Staff','Users',46,true,'Food & Hospitality',false,false),
 ('barber','Barber','Scissors',50,true,'Beauty & Fashion',false,false),
 ('hairdresser','Hairdresser','Scissors',51,true,'Beauty & Fashion',false,false),
 ('makeup-artist','Makeup Artist','Brush',52,true,'Beauty & Fashion',false,false),
 ('fashion-stylist','Fashion Stylist','Shirt',53,true,'Beauty & Fashion',false,false),
 ('tailor','Tailor','Scissors',54,true,'Beauty & Fashion',false,false),
 ('dressmaker','Dressmaker','Shirt',55,true,'Beauty & Fashion',false,false),
 ('beautician','Beautician','Sparkles',56,true,'Beauty & Fashion',false,false),
 ('entertainer','Entertainer','PartyPopper',60,true,'Entertainment & Creative Services',false,false),
 ('artist','Artist','Palette',61,true,'Entertainment & Creative Services',false,false),
 ('musician','Musician','Music',62,true,'Entertainment & Creative Services',false,false),
 ('dj','DJ','Disc3',63,true,'Entertainment & Creative Services',false,false),
 ('mc-host','MC & Event Host','Mic',64,true,'Entertainment & Creative Services',false,false),
 ('dancer','Dancer','Music2',65,true,'Entertainment & Creative Services',false,false),
 ('music-producer','Music Producer','AudioLines',66,true,'Entertainment & Creative Services',false,false),
 ('sound-engineer','Sound Engineer','SlidersHorizontal',67,true,'Entertainment & Creative Services',false,false),
 ('photographer','Photographer','Camera',68,true,'Entertainment & Creative Services',false,false),
 ('videographer','Videographer','Video',69,true,'Entertainment & Creative Services',false,false),
 ('graphic-designer','Graphic Designer','PenTool',70,true,'Entertainment & Creative Services',false,false),
 ('lawyer','Lawyer','Scale',80,true,'Professional Services',false,true),
 ('business-consultant','Business Consultant','Briefcase',81,true,'Professional Services',false,false),
 ('financial-consultant','Financial Consultant','Landmark',82,true,'Professional Services',false,false),
 ('marketing-consultant','Marketing Consultant','Megaphone',83,true,'Professional Services',false,false),
 ('it-consultant','IT Consultant','Laptop',84,true,'Professional Services',false,false),
 ('general-consultant','General Consultant','Lightbulb',85,true,'Professional Services',false,false)
ON CONFLICT (slug) DO NOTHING;

-- 3. Classify existing categories
UPDATE public.categories SET group_name='Home Repair & Technical Services', return_eligible=true, sort_order=CASE slug
    WHEN 'electrician' THEN 1 WHEN 'plumber' THEN 2 WHEN 'carpenter' THEN 3 WHEN 'painter' THEN 4
    WHEN 'ac-tech' THEN 5 WHEN 'welder' THEN 6 WHEN 'mason' THEN 7 WHEN 'cctv' THEN 8
    WHEN 'mechanic' THEN 9 WHEN 'pool-builder' THEN 11 ELSE sort_order END
  WHERE slug IN ('electrician','plumber','carpenter','painter','ac-tech','welder','mason','cctv','mechanic','pool-builder');

UPDATE public.categories SET group_name='Transportation & Delivery', return_eligible=false, sort_order=CASE slug WHEN 'driver' THEN 19 ELSE 25 END
  WHERE slug IN ('driver','dispatch-rider');

UPDATE public.categories SET group_name='Home & Personal Support', return_eligible=false, sort_order=CASE slug WHEN 'cleaner' THEN 29 ELSE 30 END
  WHERE slug IN ('cleaner','nanny');

UPDATE public.categories SET group_name='Professional Services', return_eligible=false, sort_order=86 WHERE slug='private-teacher';

-- 4. Customer cancellation of a pending booking
CREATE OR REPLACE FUNCTION public.customer_cancel_booking(_booking_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b public.bookings%ROWTYPE; cname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'pending'::booking_status THEN
    RAISE EXCEPTION 'Only requests still awaiting a response can be cancelled';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled'::booking_status,
         decline_reason = 'customer_cancelled',
         decline_note = NULLIF(trim(COALESCE(_reason,'')), ''),
         updated_at = now()
   WHERE id = _booking_id;

  SELECT full_name INTO cname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.worker_id, 'booking_cancelled', 'Booking request cancelled',
    COALESCE(cname,'The customer') || ' cancelled the booking request',
    jsonb_build_object('booking_id', _booking_id, 'status', 'cancelled'));
END $$;

GRANT EXECUTE ON FUNCTION public.customer_cancel_booking(uuid, text) TO authenticated;