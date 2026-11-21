-- 0009: notifications, delivery jobs, push subscriptions, preferences, reviews.
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind notification_kind NOT NULL,
  title varchar(160) NOT NULL,
  body text NOT NULL,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  attempts smallint NOT NULL DEFAULT 0,
  last_error text,
  idempotency_key varchar(140) NOT NULL UNIQUE,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_jobs_due_idx ON notification_jobs (status, scheduled_for);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh varchar(255) NOT NULL,
  auth varchar(255) NOT NULL,
  user_agent varchar(400),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  channels text[] NOT NULL DEFAULT ARRAY['push']::text[],
  booking_reminders boolean NOT NULL DEFAULT true,
  marketing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER notification_preferences_set_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title varchar(120),
  body varchar(2000),
  status review_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_turf_idx ON reviews (turf_id, status);
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep turf rating aggregates consistent on review write.
CREATE OR REPLACE FUNCTION public.refresh_turf_rating() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE turfs t SET
    rating_avg = agg.avg_rating,
    rating_count = agg.cnt
  FROM (
    SELECT turf_id, ROUND(AVG(rating)::numeric, 2)::double precision AS avg_rating, COUNT(*) AS cnt
    FROM reviews
    WHERE status = 'published'
      AND turf_id = COALESCE(NEW.turf_id, OLD.turf_id)
    GROUP BY turf_id
  ) agg
  WHERE t.id = agg.turf_id;
  RETURN NULL;
END $$;

CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_turf_rating();
