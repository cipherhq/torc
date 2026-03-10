-- Enable Realtime for chat_messages table so push worker can send
-- notifications when new messages arrive while recipient's app is closed.
-- Use IF NOT EXISTS pattern to avoid failure if already added.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already added
END;
$$;
