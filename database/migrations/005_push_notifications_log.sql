-- Migration: Push Notifications Log
-- Purpose: Track all push notifications sent (for debugging and analytics)
-- Run this in Supabase SQL Editor AFTER running 004_device_tokens_table.sql

CREATE TABLE IF NOT EXISTS public.push_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token_id UUID REFERENCES public.device_tokens(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL, -- 'job_accepted', 'job_cancelled', 'provider_arrived', etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB, -- Deep link data, job_id, etc.
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'error')),
  expo_ticket_id TEXT, -- Expo push ticket ID for tracking delivery
  error_message TEXT,
  error_code TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_notifications_user_id ON public.push_notifications(user_id);
CREATE INDEX idx_push_notifications_type ON public.push_notifications(notification_type);
CREATE INDEX idx_push_notifications_status ON public.push_notifications(status);
CREATE INDEX idx_push_notifications_created_at ON public.push_notifications(created_at DESC);
CREATE INDEX idx_push_notifications_ticket_id ON public.push_notifications(expo_ticket_id) WHERE expo_ticket_id IS NOT NULL;

COMMENT ON TABLE public.push_notifications IS 'Log of all push notifications sent to users. Used for debugging, analytics, and delivery tracking.';
COMMENT ON COLUMN public.push_notifications.notification_type IS 'Type of notification: job_accepted, job_cancelled, provider_arrived, job_completed, etc.';
COMMENT ON COLUMN public.push_notifications.expo_ticket_id IS 'Expo push ticket ID. Check with Expo API to verify delivery status.';

-- RLS: Users can view their own notification history
ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.push_notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role (push worker) can insert notifications
CREATE POLICY "Service role can insert notifications"
  ON public.push_notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update notifications"
  ON public.push_notifications FOR UPDATE
  USING (auth.role() = 'service_role');
