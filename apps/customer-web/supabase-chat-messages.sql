-- Chat Messages table for Torc in-app messaging
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/apojatplmfsbimgcyjoo/sql

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT 'User',
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'provider')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_chat_messages_job_id ON public.chat_messages (job_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages (created_at);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read messages for a job they participate in
-- (For now, open read/write since we support unauthenticated demo usage)
DROP POLICY IF EXISTS "Anyone can read chat messages" ON public.chat_messages;
CREATE POLICY "Anyone can read chat messages"
  ON public.chat_messages
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_messages;
CREATE POLICY "Anyone can insert chat messages"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (true);

-- Enable Realtime on chat_messages (optional, for future DB-driven subscriptions)
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- Verify
SELECT 'chat_messages table created successfully' AS status;
