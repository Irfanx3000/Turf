-- 0011: booking engine SQL functions.
-- release_expired_reservations(): safely frees slots whose online-payment
-- reservation TTL elapsed. Idempotent; row-locked; no stuck slots.
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  freed integer := 0;
BEGIN
  -- 1) Expire the stale bookings.
  WITH expired AS (
    SELECT id FROM bookings
    WHERE booking_status = 'pending_payment'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at < now()
    FOR UPDATE SKIP LOCKED
  ), mark AS (
    UPDATE bookings b
    SET booking_status = 'expired', updated_at = now()
    FROM expired e
    WHERE b.id = e.id
    RETURNING b.id
  )
  INSERT INTO booking_status_history (booking_id, from_status, to_status, reason)
  SELECT id, 'pending_payment', 'expired', 'reservation TTL elapsed' FROM mark;

  -- 2) Return their slots to the pool.
  WITH rel AS (
    UPDATE turf_slots s
    SET status = 'available', booking_id = NULL, reservation_expires_at = NULL, updated_at = now()
    WHERE s.status = 'reserved'
      AND s.reservation_expires_at IS NOT NULL
      AND s.reservation_expires_at < now()
      AND s.booking_id IN (SELECT id FROM bookings WHERE booking_status = 'expired')
    RETURNING 1
  )
  SELECT COUNT(*) INTO freed FROM rel;

  RETURN freed;
END $$;

-- mark_past_bookings_completed(): flips confirmed bookings whose last slot
-- ended into 'completed' for accurate analytics.
CREATE OR REPLACE FUNCTION public.mark_past_bookings_completed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer := 0;
BEGIN
  WITH past AS (
    SELECT b.id FROM bookings b
    WHERE b.booking_status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1 FROM booking_items bi
        WHERE bi.booking_id = b.id AND bi.ends_at > now()
      )
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE bookings b
    SET booking_status = 'completed', completed_at = now(), updated_at = now()
    FROM past p WHERE b.id = p.id
    RETURNING b.id
  )
  INSERT INTO booking_status_history (booking_id, from_status, to_status, reason)
  SELECT id, 'confirmed', 'completed', 'slot time elapsed' FROM upd;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
