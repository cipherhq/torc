-- Run underlying jobs grants and RLS policies as the caller, not the view owner.
ALTER VIEW public.v_job_lifecycle_metrics SET (security_invoker = true);

-- This operational view is not public. In particular, anonymous callers have
-- no SELECT grant on jobs and must not regain access through the view.
REVOKE ALL ON public.v_job_lifecycle_metrics FROM PUBLIC, anon;
