-- 0007: bookings, items, history, cancellations.
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference varchar(24) NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  turf_id uuid NOT NULL REFERENCES turfs(id),
  customer_id uuid NOT NULL REFERENCES profiles(id),
  booking_status booking_status NOT NULL DEFAULT 'pending_payment',
  payment_method payment_method NOT NULL,
  total_amount_minor bigint NOT NULL CHECK (total_amount_minor >= 0),
  paid_amount_minor bigint NOT NULL DEFAULT 0 CHECK (paid_amount_minor >= 0),
  refunded_amount_minor bigint NOT NULL DEFAULT 0 CHECK (refunded_amount_minor >= 0),
  currency varchar(3) NOT NULL DEFAULT 'INR',
  notes varchar(500),
  idempotency_key varchar(128) NOT NULL,
  reservation_expires_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES profiles(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_paid_not_over_total_chk CHECK (paid_amount_minor <= total_amount_minor),
  CONSTRAINT bookings_paid_amount_chk CHECK (
    booking_status NOT IN ('confirmed', 'completed') OR
    (payment_method = 'pay_at_venue' OR paid_amount_minor > 0)
  ),
  CONSTRAINT bookings_amounts_nonneg_chk CHECK (
    total_amount_minor >= 0 AND refunded_amount_minor <= paid_amount_minor
  )
);
CREATE UNIQUE INDEX bookings_customer_idem_uq ON bookings (customer_id, idempotency_key);
CREATE INDEX bookings_tenant_created_idx ON bookings (tenant_id, created_at);
CREATE INDEX bookings_customer_idx ON bookings (customer_id, created_at);
CREATE INDEX bookings_turf_start_idx ON bookings (turf_id, booking_status);
CREATE INDEX bookings_reservation_expiry_idx ON bookings (booking_status, reservation_expires_at);
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES turf_slots(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  -- THE anti-double-booking guarantee: one slot maps to at most one item.
  CONSTRAINT booking_items_slot_uq UNIQUE (slot_id)
);
CREATE INDEX booking_items_booking_idx ON booking_items (booking_id);

CREATE TABLE booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status booking_status,
  to_status booking_status NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  reason varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_history_booking_idx ON booking_status_history (booking_id, created_at);

CREATE TABLE booking_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  cancelled_by uuid NOT NULL REFERENCES profiles(id),
  reason varchar(500),
  policy_applied cancellation_policy NOT NULL,
  refund_due_minor bigint NOT NULL DEFAULT 0 CHECK (refund_due_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
