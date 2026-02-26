-- Messaging system settings and enhancements

-- 1. Seed messaging-related platform_settings rows
INSERT INTO public.platform_settings (key, value, updated_at) VALUES
  ('chat_max_message_length', '1000'::jsonb, now()),
  ('chat_messages_per_page', '30'::jsonb, now()),
  ('chat_history_retention_days', '90'::jsonb, now()),
  ('chat_conversations_per_page', '20'::jsonb, now()),
  ('chat_max_image_size_mb', '5'::jsonb, now()),
  ('chat_enable_images', 'true'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- 2. Add image_url column to chat_messages if not present
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Denormalized last-message columns on jobs for fast conversation listing
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_message_sender_role TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_last_message_at
  ON public.jobs(last_message_at DESC NULLS LAST);

-- 4. Trigger: auto-update job's last_message fields on new chat message
CREATE OR REPLACE FUNCTION update_job_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.jobs
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.message, 80),
      last_message_sender_role = NEW.sender_role
  WHERE id::text = NEW.job_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_job_last_message ON public.chat_messages;
CREATE TRIGGER trg_update_job_last_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_job_last_message();
