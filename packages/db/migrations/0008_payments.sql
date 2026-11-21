-- 0008: payments, webhook events (idempotent), refunds.
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  provider varchar(30) NOT NULL DEFAULT 'razorpay',
  provider_order_id varchar(80) NOT NULL UNIQUE,
  provider_payment_id varchar(80),
  method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency varchar(3) NOT NULL DEFAULT 'INR',
  ordered_by uuid REFERENCES profiles(id),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_booking_idx ON payments (booking_id);
CREATE INDEX payments_status_idx ON payments (status);
CREATE UNIQUE INDEX payments_provider_payment_uq ON payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(30) NOT NULL,
  event_id varchar(120) NOT NULL,
  event_type varchar(80) NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  payment_id uuid REFERENCES payments(id),
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_provider_event_uq UNIQUE (provider, event_id)
);
CREATE INDEX payment_events_unprocessed_idx ON payment_events (processed_at);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  provider_refund_id varchar(80),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  status refund_status NOT NULL DEFAULT 'pending',
  reason varchar(255),
  initiated_by uuid REFERENCES profiles(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_payment_idx ON refunds (payment_id);
CREATE INDEX refunds_booking_idx ON refunds (booking_id);
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
