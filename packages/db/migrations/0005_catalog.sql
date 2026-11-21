-- 0005: locations, sports, amenities, turfs, images, links, operating hours.
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  city_id uuid REFERENCES cities(id),
  city_name varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  area_name varchar(120),
  address_line1 varchar(255) NOT NULL,
  address_line2 varchar(255),
  postal_code varchar(10),
  geog geography(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX locations_tenant_idx ON locations (tenant_id);
CREATE INDEX locations_city_idx ON locations (city_id);
CREATE INDEX locations_geog_idx ON locations USING gist (geog);
CREATE TRIGGER locations_set_updated_at BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE sports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(60) NOT NULL UNIQUE,
  slug varchar(70) NOT NULL UNIQUE,
  icon varchar(60),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  slug varchar(90) NOT NULL UNIQUE,
  icon varchar(60)
);

CREATE TABLE turfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  slug varchar(180) NOT NULL UNIQUE,
  tagline varchar(200),
  description text,
  surface_type surface_type NOT NULL DEFAULT 'artificial_turf',
  base_price_minor bigint NOT NULL CHECK (base_price_minor >= 0),
  slot_duration_minutes smallint NOT NULL DEFAULT 60 CHECK (slot_duration_minutes > 0),
  capacity smallint CHECK (capacity IS NULL OR capacity > 0),
  cancellation_policy cancellation_policy NOT NULL DEFAULT 'free_until_24h',
  custom_refund_percent smallint CHECK (custom_refund_percent IS NULL OR (custom_refund_percent BETWEEN 0 AND 100)),
  pay_at_venue_allowed boolean NOT NULL DEFAULT true,
  status turf_status NOT NULL DEFAULT 'draft',
  rating_avg double precision CHECK (rating_avg IS NULL OR (rating_avg >= 0 AND rating_avg <= 5)),
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX turfs_tenant_idx ON turfs (tenant_id);
CREATE INDEX turfs_location_idx ON turfs (location_id);
CREATE INDEX turfs_status_idx ON turfs (status);
CREATE TRIGGER turfs_set_updated_at BEFORE UPDATE ON turfs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ownership consistency: a turf's location must belong to the same tenant.
CREATE OR REPLACE FUNCTION public.tenant_location_matches(t uuid, l uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM locations loc WHERE loc.id = l AND loc.tenant_id = t)
$$;

ALTER TABLE turfs
  ADD CONSTRAINT turfs_tenant_location_match
  CHECK (tenant_location_matches(tenant_id, location_id));

CREATE TABLE turf_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt varchar(200),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX turf_images_turf_idx ON turf_images (turf_id, sort_order);

CREATE TABLE turf_sports (
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  sport_id uuid NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  PRIMARY KEY (turf_id, sport_id)
);

CREATE TABLE turf_amenities (
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  amenity_id uuid NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (turf_id, amenity_id)
);

CREATE TABLE operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  day day_of_week NOT NULL,
  opens_at time NOT NULL DEFAULT '06:00',
  closes_at time NOT NULL DEFAULT '23:00',
  closed boolean NOT NULL DEFAULT false,
  CONSTRAINT operating_hours_turf_day_uq UNIQUE (turf_id, day),
  CONSTRAINT operating_hours_window_chk CHECK (closed OR opens_at < closes_at)
);
