-- 0013: least-privilege application roles.
--   turf_app     — RLS-enforced "user pool" used for request-scoped reads.
--   turf_service — BYPASSRLS "service pool" for the transactional booking
--                  engine, webhook processing and background jobs.
--
-- !! DEVELOPMENT DEFAULTS: change both passwords before any real deployment
-- !! (see docs/ARCHITECTURE.md "Database roles"). Migrations do not own
-- !! production credentials; provision those out-of-band.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turf_app') THEN
    CREATE ROLE turf_app LOGIN PASSWORD 'turf_app_devpw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turf_service') THEN
    CREATE ROLE turf_service LOGIN PASSWORD 'turf_service_devpw' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;

-- turf_app: read-mostly, RLS decides the rows.
GRANT USAGE ON SCHEMA public TO turf_app, turf_service;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO turf_app;
GRANT UPDATE (full_name, phone, avatar_url, updated_at) ON profiles TO turf_app;
GRANT INSERT, UPDATE ON notification_preferences TO turf_app;
GRANT INSERT, DELETE ON push_subscriptions TO turf_app;
GRANT INSERT, UPDATE ON reviews TO turf_app;
GRANT UPDATE (read_at) ON notifications TO turf_app;
GRANT USAGE, SELECT ON SEQUENCE booking_reference_seq TO turf_service;

-- turf_service: full DML it needs, still no DDL and no DELETE on ledgers.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO turf_service;
GRANT INSERT, DELETE ON turf_images, turf_sports, turf_amenities, tenant_members, slot_templates, pricing_rules, slot_blocks TO turf_service;
GRANT DELETE ON push_subscriptions, notifications TO turf_service;
REVOKE DELETE ON audit_logs, bookings, payments, payment_events, refunds, booking_status_history FROM turf_service;
