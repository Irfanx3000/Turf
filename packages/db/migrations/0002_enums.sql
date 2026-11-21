-- 0002: enum types.
CREATE TYPE platform_role AS ENUM ('customer', 'tenant_owner', 'super_admin');
CREATE TYPE tenant_role AS ENUM ('owner', 'manager', 'staff');
CREATE TYPE tenant_status AS ENUM ('pending_verification', 'active', 'suspended');
CREATE TYPE turf_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE surface_type AS ENUM ('natural_grass', 'artificial_turf', 'hybrid', 'clay', 'concrete', 'wood');
CREATE TYPE day_of_week AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
CREATE TYPE slot_status AS ENUM ('available', 'reserved', 'booked', 'blocked', 'expired');
CREATE TYPE booking_status AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show', 'expired');
CREATE TYPE payment_method AS ENUM ('online', 'pay_at_venue');
CREATE TYPE payment_status AS ENUM ('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE refund_status AS ENUM ('pending', 'processed', 'failed');
CREATE TYPE pricing_rule_type AS ENUM ('base', 'weekend', 'peak_hours', 'special_date');
CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms', 'whatsapp');
CREATE TYPE notification_kind AS ENUM ('booking_confirmed', 'booking_reminder_24h', 'booking_reminder_1h', 'booking_cancelled', 'payment_received', 'refund_processed', 'tenant_booking_alert');
CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE cancellation_policy AS ENUM ('free_until_24h', 'free_until_2h', 'non_refundable', 'custom');
CREATE TYPE review_status AS ENUM ('published', 'hidden');
