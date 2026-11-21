-- Dropping RLS entirely is the honest reversal for this migration bundle.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','platform_roles','cities','tenants','tenant_members','locations','sports',
    'amenities','turfs','turf_images','turf_sports','turf_amenities','operating_hours',
    'slot_templates','slot_blocks','pricing_rules','turf_slots','bookings','booking_items',
    'booking_status_history','booking_cancellations','payments','payment_events','refunds',
    'notifications','notification_jobs','push_subscriptions','notification_preferences',
    'reviews','audit_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS ALL ON %I', t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.payment_visible(uuid);
DROP FUNCTION IF EXISTS public.booking_visible(uuid);
DROP FUNCTION IF EXISTS public.turf_is_published(uuid);
