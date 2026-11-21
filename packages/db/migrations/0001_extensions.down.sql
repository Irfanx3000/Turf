-- Note: dropping postgis on Supabase is not permitted; harmless locally.
DROP EXTENSION IF EXISTS pgcrypto;
DROP EXTENSION IF EXISTS btree_gist;
DROP EXTENSION IF EXISTS postgis;
