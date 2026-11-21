-- 0012: Row Level Security.
-- Model:
--   * "user pool" connections (turf_app) are RLS-enforced; auth.uid() comes
--     from request.jwt.claim.sub which the API sets per request/transaction.
--   * "service pool" connections (turf_service, BYPASSRLS) are used ONLY by
--     the API's transactional booking/payment engine and background jobs,
--     after the application layer has authenticated and authorized the
--     request. Credentials never leave the server.
-- RLS is enabled on every table as the default-deny baseline.

-- profiles: self-service reads/updates; super admin oversight.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (id = auth.uid() OR public.is_super_admin());
CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid() AND is_active) WITH CHECK (id = auth.uid());

ALTER TABLE platform_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_roles_select ON platform_roles FOR SELECT USING (true);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY cities_select ON cities FOR SELECT USING (is_active OR public.is_super_admin());

-- tenants: public sees active orgs (needed on turf pages); members see theirs.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON tenants FOR SELECT
  USING (status = 'active' OR public.is_tenant_member(id) OR public.is_super_admin());
CREATE POLICY tenants_manage ON tenants FOR UPDATE
  USING (public.has_tenant_role(id, 'manager') OR public.is_super_admin())
  WITH CHECK (public.has_tenant_role(id, 'manager') OR public.is_super_admin());

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_members_select ON tenant_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_tenant_member(tenant_id) OR public.is_super_admin());
CREATE POLICY tenant_members_manage ON tenant_members FOR INSERT
  WITH CHECK (public.has_tenant_role(tenant_id, 'manager'));
CREATE POLICY tenant_members_update ON tenant_members FOR UPDATE
  USING (public.has_tenant_role(tenant_id, 'manager')) WITH CHECK (public.has_tenant_role(tenant_id, 'manager'));
CREATE POLICY tenant_members_delete ON tenant_members FOR DELETE
  USING (public.has_tenant_role(tenant_id, 'manager'));

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY locations_select ON locations FOR SELECT USING (true);
CREATE POLICY locations_manage ON locations FOR UPDATE
  USING (public.has_tenant_role(tenant_id, 'staff')) WITH CHECK (public.has_tenant_role(tenant_id, 'staff'));

ALTER TABLE sports ENABLE ROW LEVEL SECURITY;
CREATE POLICY sports_select ON sports FOR SELECT USING (true);
ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
CREATE POLICY amenities_select ON amenities FOR SELECT USING (true);

-- turfs: published ones are public; drafts visible to their tenant.
ALTER TABLE turfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY turfs_select ON turfs FOR SELECT
  USING (status = 'published' OR public.is_tenant_member(tenant_id) OR public.is_super_admin());
CREATE POLICY turfs_manage ON turfs FOR UPDATE
  USING (public.has_tenant_role(tenant_id, 'manager')) WITH CHECK (public.has_tenant_role(tenant_id, 'manager'));

CREATE OR REPLACE FUNCTION public.turf_is_published(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM turfs WHERE id = t AND status = 'published')
$$;

-- turf children: public read only when parent turf is published.
ALTER TABLE turf_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY turf_images_select ON turf_images FOR SELECT
  USING (public.turf_is_published(turf_id) OR public.is_tenant_member((SELECT tenant_id FROM turfs WHERE id = turf_id)) OR public.is_super_admin());
CREATE POLICY turf_images_manage ON turf_images FOR UPDATE
  USING (public.has_tenant_role((SELECT tenant_id FROM turfs WHERE id = turf_id), 'staff'));

ALTER TABLE turf_sports ENABLE ROW LEVEL SECURITY;
CREATE POLICY turf_sports_select ON turf_sports FOR SELECT
  USING (public.turf_is_published(turf_id) OR public.is_super_admin());

ALTER TABLE turf_amenities ENABLE ROW LEVEL SECURITY;
CREATE POLICY turf_amenities_select ON turf_amenities FOR SELECT
  USING (public.turf_is_published(turf_id) OR public.is_super_admin());

ALTER TABLE operating_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY operating_hours_select ON operating_hours FOR SELECT
  USING (public.turf_is_published(turf_id) OR public.is_tenant_member((SELECT tenant_id FROM turfs WHERE id = turf_id)));

ALTER TABLE slot_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY slot_templates_select ON slot_templates FOR SELECT
  USING (public.is_tenant_member((SELECT tenant_id FROM turfs WHERE id = turf_id)));

ALTER TABLE slot_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY slot_blocks_select ON slot_blocks FOR SELECT
  USING (public.is_tenant_member((SELECT tenant_id FROM turfs WHERE id = turf_id)));

ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rules_select ON pricing_rules FOR SELECT
  USING (public.is_tenant_member((SELECT tenant_id FROM turfs WHERE id = turf_id)));

-- Slots: availability is public for published turfs. Writes are service-only.
ALTER TABLE turf_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY turf_slots_select ON turf_slots FOR SELECT
  USING (
    public.turf_is_published(turf_id)
    OR public.is_tenant_member((SELECT tenant_id FROM turfs WHERE id = turf_id))
    OR public.is_super_admin()
  );

-- Bookings: customer sees own; tenant sees theirs; writes via service pool.
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_select ON bookings FOR SELECT
  USING (
    customer_id = auth.uid()
    OR public.is_tenant_member(tenant_id)
    OR public.is_super_admin()
  );

CREATE OR REPLACE FUNCTION public.booking_visible(b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings bk
    WHERE bk.id = b
      AND (bk.customer_id = auth.uid() OR public.is_tenant_member(bk.tenant_id) OR public.is_super_admin())
  )
$$;

ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_items_select ON booking_items FOR SELECT
  USING (public.booking_visible(booking_id));

ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_history_select ON booking_status_history FOR SELECT
  USING (public.booking_visible(booking_id));

ALTER TABLE booking_cancellations ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_cancellations_select ON booking_cancellations FOR SELECT
  USING (public.booking_visible(booking_id));

-- Payments/refunds: visible to the booking's customer or tenant only.
CREATE OR REPLACE FUNCTION public.payment_visible(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM payments pay
    WHERE pay.id = p AND public.booking_visible(pay.booking_id)
  )
$$;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_select ON payments FOR SELECT
  USING (public.payment_visible(id));

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
-- No SELECT policy: raw webhook payloads are service-only.

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY refunds_select ON refunds FOR SELECT
  USING (public.payment_visible(payment_id));

-- Notifications: strictly the owner.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE notification_jobs ENABLE ROW LEVEL SECURITY;
-- service-only

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_select ON push_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY push_insert ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY push_delete ON push_subscriptions FOR DELETE USING (user_id = auth.uid());

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_prefs_select ON notification_preferences FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_prefs_write ON notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY notif_prefs_update ON notification_preferences FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Reviews: published are public; customers write their own.
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviews_select ON reviews FOR SELECT
  USING (status = 'published' OR customer_id = auth.uid() OR public.is_super_admin());
CREATE POLICY reviews_insert_own ON reviews FOR INSERT
  WITH CHECK (customer_id = auth.uid());
CREATE POLICY reviews_update_own ON reviews FOR UPDATE
  USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());

-- Audit logs: super admin read; service-only writes. Append-only.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (public.is_super_admin());
