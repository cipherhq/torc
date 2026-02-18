-- Migration: Device Tokens Table
-- Purpose: Store push notification tokens from mobile devices (iOS/Android)
-- Run this in Supabase SQL Editor AFTER running 003_cancel_job_rpc.sql

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  push_token TEXT NOT NULL,
  device_id TEXT, -- Optional unique device identifier
  device_name TEXT, -- Optional device name for user reference
  app_version TEXT,
  app_build TEXT,
  os_version TEXT,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, push_token)
);

CREATE INDEX idx_device_tokens_user_id ON public.device_tokens(user_id);
CREATE INDEX idx_device_tokens_active ON public.device_tokens(is_active) WHERE is_active = true;
CREATE INDEX idx_device_tokens_platform ON public.device_tokens(platform);

COMMENT ON TABLE public.device_tokens IS 'Push notification tokens from mobile devices. Used to send notifications when jobs are accepted, cancelled, etc.';
COMMENT ON COLUMN public.device_tokens.push_token IS 'Expo push token (ExponentPushToken[...]) or FCM token';
COMMENT ON COLUMN public.device_tokens.is_active IS 'Set to false when token becomes invalid (device uninstalled app, token expired, etc.)';
COMMENT ON COLUMN public.device_tokens.last_used_at IS 'Updated when a push is successfully sent to this token';

-- RLS: Users can only manage their own tokens
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens"
  ON public.device_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens"
  ON public.device_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON public.device_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON public.device_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_device_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_device_tokens_updated_at();

-- Helper function to register or update a device token
CREATE OR REPLACE FUNCTION public.upsert_device_token(
  p_user_id UUID,
  p_platform TEXT,
  p_push_token TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_app_build TEXT DEFAULT NULL,
  p_os_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  -- Insert or update the token
  INSERT INTO device_tokens (
    user_id,
    platform,
    push_token,
    device_id,
    device_name,
    app_version,
    app_build,
    os_version,
    is_active,
    last_used_at
  )
  VALUES (
    p_user_id,
    p_platform,
    p_push_token,
    p_device_id,
    p_device_name,
    p_app_version,
    p_app_build,
    p_os_version,
    true,
    NOW()
  )
  ON CONFLICT (user_id, push_token)
  DO UPDATE SET
    is_active = true,
    last_used_at = NOW(),
    device_name = COALESCE(EXCLUDED.device_name, device_tokens.device_name),
    app_version = COALESCE(EXCLUDED.app_version, device_tokens.app_version),
    app_build = COALESCE(EXCLUDED.app_build, device_tokens.app_build),
    os_version = COALESCE(EXCLUDED.os_version, device_tokens.os_version),
    updated_at = NOW()
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_device_token IS 'Register or update a device push token. Call this when user logs in or token refreshes.';

GRANT EXECUTE ON FUNCTION public.upsert_device_token TO authenticated;
