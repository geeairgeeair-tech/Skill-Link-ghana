DO $$
DECLARE
  bad text[] := '{}';
  bid uuid := '6177c005-9380-4443-94cf-95f488b737de';
  cust text := '32e0226d-5c31-4fa5-bc4c-a778935ff5af';
  wrk  text := '0cc8e799-a2f7-44fa-be24-4b5c44d997a2';
BEGIN
  -- 1. customer forges payment status / amount paid
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',cust,'role','authenticated')::text, true);
    UPDATE public.bookings SET payment_status='confirmed', amount_paid=999999 WHERE id=bid;
    bad := bad || 'customer_payment';
  EXCEPTION WHEN others THEN NULL; END;
  RESET ROLE;

  -- 2. worker forges final amount + admin resolution
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',wrk,'role','authenticated')::text, true);
    UPDATE public.bookings SET final_amount=1, admin_resolution_note='hax', admin_resolved_at=now() WHERE id=bid;
    bad := bad || 'worker_amount_admin';
  EXCEPTION WHEN others THEN NULL; END;
  RESET ROLE;

  -- 3. customer forges dispute + status
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',cust,'role','authenticated')::text, true);
    UPDATE public.bookings SET status='disputed', dispute_reason='fake', disputed_at=now() WHERE id=bid;
    bad := bad || 'customer_dispute_status';
  EXCEPTION WHEN others THEN NULL; END;
  RESET ROLE;

  -- 4. worker forges payment status
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',wrk,'role','authenticated')::text, true);
    UPDATE public.bookings SET payment_status='confirmed' WHERE id=bid;
    bad := bad || 'worker_payment';
  EXCEPTION WHEN others THEN NULL; END;
  RESET ROLE;

  -- 5. legitimate: unprotected column write by customer must still work
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',cust,'role','authenticated')::text, true);
    UPDATE public.bookings SET description = description WHERE id=bid;
  EXCEPTION WHEN others THEN bad := bad || ('legit_blocked:'||SQLERRM); END;
  RESET ROLE;

  IF array_length(bad,1) IS NOT NULL THEN
    RAISE EXCEPTION 'Booking guard verification FAILED: %', bad;
  END IF;
END $$;