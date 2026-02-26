-- Allow 'delivered' status written by the push worker when Expo receipts confirm delivery.
-- Without this, updates fail against the CHECK constraint in 005_push_notifications_log.sql.

ALTER TABLE public.push_notifications
  DROP CONSTRAINT IF EXISTS push_notifications_status_check;

ALTER TABLE public.push_notifications
  ADD CONSTRAINT push_notifications_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'error'));
