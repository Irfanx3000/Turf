-- 0001: extensions. PostGIS for geography, btree_gist for the slot exclusion
-- constraint, pgcrypto for gen_random_uuid on older PG.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
