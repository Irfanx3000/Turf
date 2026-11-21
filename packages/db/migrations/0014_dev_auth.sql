-- 0014: DEVELOPMENT-ONLY credential table.
-- Enables the full stack to run without Supabase Auth (the dev JWT adapter).
-- Never used in production: the API refuses to enable dev auth unless
-- NODE_ENV is development/test. Supabase deployments typically skip this.
CREATE TABLE dev_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dev_users ENABLE ROW LEVEL SECURITY;
