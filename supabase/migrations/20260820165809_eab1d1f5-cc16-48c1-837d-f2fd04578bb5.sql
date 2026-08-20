
DO $$
DECLARE b record; uid uuid; other uuid := gen_random_uuid(); mid uuid; okmsg text; res text := '';
BEGIN
  SELECT * INTO b FROM public.bookings WHERE worker_id IS NOT NULL LIMIT 1;
  uid := b.customer_id;

  -- text-only message as customer
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.messages (booking_id, sender_id, content) VALUES (b.id, uid, '[sec-test] text only') RETURNING id INTO mid;
  res := res || 'text-ok;';

  -- own attachment
  INSERT INTO public.messages (booking_id, sender_id, content, attachment_url)
  VALUES (b.id, uid, '[sec-test] own', uid::text || '/sec-test.jpg');
  res := res || 'own-attach-ok;';

  -- forged attachment
  BEGIN
    INSERT INTO public.messages (booking_id, sender_id, content, attachment_url)
    VALUES (b.id, uid, '[sec-test] forged', other::text || '/victim.jpg');
    res := res || 'FORGED-ALLOWED!;';
  EXCEPTION WHEN others THEN res := res || 'forged-blocked;';
  END;

  -- booking_add_photos as worker
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b.worker_id)::text, true);
  BEGIN
    PERFORM public.booking_add_photos(b.id, 'progress', jsonb_build_array(b.worker_id::text || '/sec-progress.jpg'));
    res := res || 'own-progress-ok;';
  EXCEPTION WHEN others THEN res := res || 'own-progress-FAILED:' || SQLERRM || ';';
  END;
  BEGIN
    PERFORM public.booking_add_photos(b.id, 'completion', jsonb_build_array(other::text || '/victim.jpg'));
    res := res || 'FORGED-PHOTO-ALLOWED!;';
  EXCEPTION WHEN others THEN res := res || 'forged-photo-blocked;';
  END;

  RESET ROLE;
  -- cleanup test artifacts
  DELETE FROM public.messages WHERE content LIKE '[sec-test]%';
  UPDATE public.bookings SET progress_photos = (
    SELECT COALESCE(jsonb_agg(it),'[]'::jsonb) FROM jsonb_array_elements(progress_photos) it
    WHERE public.media_element_path(it) NOT LIKE '%sec-progress.jpg'
  ) WHERE id = b.id;

  RAISE NOTICE 'SECTEST %', res;
  IF res LIKE '%ALLOWED!%' OR res LIKE '%FAILED%' THEN
    RAISE EXCEPTION 'Security test failure: %', res;
  END IF;
END $$;
