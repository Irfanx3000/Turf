DROP TRIGGER IF EXISTS reviews_refresh_rating ON reviews;
DROP FUNCTION IF EXISTS public.refresh_turf_rating();
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS notification_jobs;
DROP TABLE IF EXISTS notifications;
