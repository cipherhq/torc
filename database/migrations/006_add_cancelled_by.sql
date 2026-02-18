-- Add cancelled_by column to jobs table
-- This tracks who cancelled the job (customer or provider)

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.jobs.cancelled_by IS 'User ID of who cancelled the job (customer or provider)';

-- Add index for queries filtering by cancelled_by
CREATE INDEX IF NOT EXISTS idx_jobs_cancelled_by ON public.jobs(cancelled_by);
