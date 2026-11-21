-- 0004: profiles, platform role lookup, cities, tenants, membership.
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  platform_role platform_role NOT NULL DEFAULT 'customer',
  full_name varchar(120),
  phone varchar(20),
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE platform_roles (
  role platform_role PRIMARY KEY,
  description text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  slug varchar(90) NOT NULL UNIQUE,
  state_name varchar(80) NOT NULL,
  timezone varchar(60) NOT NULL DEFAULT 'Asia/Kolkata',
  center geography(Point, 4326),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cities_center_idx ON cities USING gist (center);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(90) NOT NULL UNIQUE,
  status tenant_status NOT NULL DEFAULT 'pending_verification',
  city_id uuid REFERENCES cities(id),
  support_email varchar(255),
  support_phone varchar(20),
  logo_url text,
  verified_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenants_status_idx ON tenants (status);
CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role tenant_role NOT NULL DEFAULT 'staff',
  invited_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_members_tenant_user_uq UNIQUE (tenant_id, user_id)
);
CREATE INDEX tenant_members_user_idx ON tenant_members (user_id);
CREATE TRIGGER tenant_members_set_updated_at BEFORE UPDATE ON tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tenant helpers used by RLS policies (security definer: owner bypasses RLS
-- on tenant_members, avoiding recursive policy evaluation).
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.platform_role = 'super_admin' FROM profiles p WHERE p.id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(target_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = target_tenant AND tm.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(target_tenant uuid, min_role tenant_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = target_tenant AND tm.user_id = auth.uid()
      AND (tm.role = min_role
           OR (min_role = 'manager' AND tm.role = 'owner')
           OR (min_role = 'staff' AND tm.role IN ('owner', 'manager')))
  )
$$;
