-- Derive the public display name from the locked legal identity.
CREATE OR REPLACE FUNCTION public.sync_display_name_from_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  derived text;
BEGIN
  derived := btrim(concat_ws(' ', nullif(btrim(NEW.first_name), ''), nullif(btrim(NEW.last_name), '')));
  IF derived <> '' THEN
    -- Legal identity present: display name is always generated, never user-supplied.
    NEW.full_name := derived;
  ELSIF TG_OP = 'UPDATE' THEN
    -- No legal identity yet (legacy account): keep the existing name, block edits.
    NEW.full_name := OLD.full_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_display_name_from_identity ON public.profiles;
CREATE TRIGGER sync_display_name_from_identity
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_display_name_from_identity();

-- Migrate existing accounts that already have a legal identity.
UPDATE public.profiles
SET full_name = btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), '')))
WHERE btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))) <> ''
  AND full_name IS DISTINCT FROM btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), '')));