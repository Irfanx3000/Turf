-- 0003: shared functions and triggers.
-- auth.uid()/auth.role() shims: on Supabase these already exist in the auth
-- schema; on vanilla Postgres (local dev) we provide API-compatible versions
-- so the exact same RLS policies run in both environments.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'auth' AND p.proname = 'uid') THEN
    EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
             $fn$ SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid $fn$';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'auth' AND p.proname = 'role') THEN
    EXECUTE 'CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
             $fn$ SELECT COALESCE(current_setting(''request.jwt.claim.role'', true), ''anon'') $fn$';
  END IF;
END $$;

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Booking reference sequence: TRF-<year>-<serial>.
CREATE SEQUENCE IF NOT EXISTS booking_reference_seq START 100000;

CREATE OR REPLACE FUNCTION public.next_booking_reference() RETURNS text
LANGUAGE sql AS $$
  SELECT 'TRF-' || to_char(now(), 'YYYY') || '-' || nextval('booking_reference_seq')::text
$$;
