REVOKE ALL ON SCHEMA public FROM turf_app, turf_service;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM turf_app, turf_service;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turf_app') THEN
    DROP ROLE turf_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turf_service') THEN
    DROP ROLE turf_service;
  END IF;
END $$;
