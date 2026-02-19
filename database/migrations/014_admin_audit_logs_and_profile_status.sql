-- Admin audit log + user status lifecycle columns

-- 1) Ensure profiles has status fields for admin account controls.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

UPDATE public.profiles
SET status = 'active'
WHERE status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_check
      CHECK (status IN ('active', 'suspended', 'pending'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- 2) Admin audit log table for write actions in admin surfaces.
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_id ON public.admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON public.admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
