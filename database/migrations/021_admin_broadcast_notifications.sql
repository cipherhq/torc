-- Migration 021: Admin Broadcast Notifications
-- Purpose: Allow admins to send broadcast notifications to targeted user groups

-- 1. Broadcast log table (tracks all broadcasts sent by admins)
CREATE TABLE IF NOT EXISTS public.broadcast_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('service','payment','promo','rating','alert','info')),
  audience TEXT NOT NULL CHECK (audience IN ('all','customers','providers')),
  action_url TEXT,
  recipient_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_log_admin ON public.broadcast_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_log_created ON public.broadcast_log(created_at DESC);

ALTER TABLE public.broadcast_log ENABLE ROW LEVEL SECURITY;

-- Admins can view broadcast history
CREATE POLICY "Admins can view broadcast log"
  ON public.broadcast_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Only via RPC (service role insert handled by function)
CREATE POLICY "Service role can insert broadcast log"
  ON public.broadcast_log FOR INSERT
  WITH CHECK (auth.uid() = admin_id);

-- 2. RPC function to send broadcast notifications
CREATE OR REPLACE FUNCTION public.send_broadcast_notification(
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_audience TEXT DEFAULT 'all',
  p_action_url TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
  v_count INTEGER;
  v_broadcast_id UUID;
BEGIN
  -- Get calling user
  v_admin_id := auth.uid();

  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admins can send broadcast notifications';
  END IF;

  -- Validate type
  IF p_type NOT IN ('service','payment','promo','rating','alert','info') THEN
    RAISE EXCEPTION 'Invalid notification type: %', p_type;
  END IF;

  -- Validate audience
  IF p_audience NOT IN ('all','customers','providers') THEN
    RAISE EXCEPTION 'Invalid audience: %', p_audience;
  END IF;

  -- Insert notifications for targeted users
  WITH target_users AS (
    SELECT id FROM public.profiles
    WHERE
      CASE p_audience
        WHEN 'all' THEN true
        WHEN 'customers' THEN role = 'customer'
        WHEN 'providers' THEN role = 'provider'
      END
  )
  INSERT INTO public.notifications (user_id, type, title, message, action_url)
  SELECT id, p_type, p_title, p_message, p_action_url
  FROM target_users;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Log the broadcast
  INSERT INTO public.broadcast_log (admin_id, title, message, type, audience, action_url, recipient_count)
  VALUES (v_admin_id, p_title, p_message, p_type, p_audience, p_action_url, v_count)
  RETURNING id INTO v_broadcast_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.send_broadcast_notification IS 'Sends a notification to all users matching the audience filter. Admin-only.';
