-- 0006: slot templates, materialized slots, blocks, pricing rules.
CREATE TABLE slot_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  days_of_week text[] NOT NULL CHECK (array_length(days_of_week, 1) > 0),
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_duration_minutes smallint NOT NULL DEFAULT 60 CHECK (slot_duration_minutes > 0),
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slot_templates_window_chk CHECK (start_time < end_time),
  CONSTRAINT slot_templates_effective_chk CHECK (effective_to IS NULL OR effective_from <= effective_to)
);
CREATE INDEX slot_templates_turf_idx ON slot_templates (turf_id, is_active);
CREATE TRIGGER slot_templates_set_updated_at BEFORE UPDATE ON slot_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE turf_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  template_id uuid REFERENCES slot_templates(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  status slot_status NOT NULL DEFAULT 'available',
  booking_id uuid,
  reservation_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turf_slots_window_chk CHECK (starts_at < ends_at),
  CONSTRAINT turf_slots_reservation_chk CHECK (
    (status IN ('reserved', 'booked')) = (booking_id IS NOT NULL)
  )
);
CREATE INDEX turf_slots_turf_start_idx ON turf_slots (turf_id, starts_at);
CREATE INDEX turf_slots_status_idx ON turf_slots (status);
CREATE INDEX turf_slots_expiry_idx ON turf_slots (status, reservation_expires_at);
CREATE TRIGGER turf_slots_set_updated_at BEFORE UPDATE ON turf_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DATABASE-LEVEL guarantee: two active slots of the same turf can never
-- overlap in time. Adjacent half-open ranges are allowed.
ALTER TABLE turf_slots
  ADD CONSTRAINT turf_slots_no_overlap
  EXCLUDE USING gist (
    turf_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('available', 'reserved', 'booked', 'blocked'));

CREATE TABLE slot_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason varchar(200),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slot_blocks_window_chk CHECK (starts_at < ends_at)
);
CREATE INDEX slot_blocks_turf_idx ON slot_blocks (turf_id, starts_at);

CREATE TABLE pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  rule_type pricing_rule_type NOT NULL,
  name varchar(120) NOT NULL,
  days_of_week text[],
  start_time time,
  end_time time,
  special_date date,
  multiplier_percent smallint CHECK (multiplier_percent IS NULL OR multiplier_percent > 0),
  price_override_minor bigint CHECK (price_override_minor IS NULL OR price_override_minor >= 0),
  priority smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_rules_adjustment_chk CHECK (
    (multiplier_percent IS NULL) <> (price_override_minor IS NULL)
  )
);
CREATE INDEX pricing_rules_turf_idx ON pricing_rules (turf_id, is_active);
CREATE TRIGGER pricing_rules_set_updated_at BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
