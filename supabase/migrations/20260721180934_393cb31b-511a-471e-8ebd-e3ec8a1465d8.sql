
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='booking_status' AND e.enumlabel='awaiting_customer_confirmation') THEN
    ALTER TYPE booking_status ADD VALUE 'awaiting_customer_confirmation';
  END IF;
END $$;
