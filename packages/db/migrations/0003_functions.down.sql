DROP FUNCTION IF EXISTS public.next_booking_reference();
DROP SEQUENCE IF EXISTS booking_reference_seq;
DROP FUNCTION IF EXISTS public.set_updated_at();
-- auth shims are left in place; Supabase owns that schema in production.
