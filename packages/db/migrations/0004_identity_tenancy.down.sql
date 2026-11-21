DROP FUNCTION IF EXISTS public.has_tenant_role(uuid, tenant_role);
DROP FUNCTION IF EXISTS public.is_tenant_member(uuid);
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP TABLE IF EXISTS tenant_members;
DROP TABLE IF EXISTS tenants;
DROP TABLE IF EXISTS cities;
DROP TABLE IF EXISTS platform_roles;
DROP TABLE IF EXISTS profiles;
