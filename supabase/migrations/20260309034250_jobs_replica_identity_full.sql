-- Set REPLICA IDENTITY FULL on jobs so Realtime UPDATE events include old row values
-- (needed for push worker to detect status changes via old.status vs new.status)
ALTER TABLE public.jobs REPLICA IDENTITY FULL;
