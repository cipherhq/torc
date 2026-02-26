-- Provider job dismissals: tracks which providers have dismissed/declined which jobs
-- so they never reappear in the provider's active request queue.

CREATE TABLE IF NOT EXISTS public.provider_job_dismissals (
  provider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (provider_id, job_id)
);

ALTER TABLE public.provider_job_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can read their own dismissals"
  ON public.provider_job_dismissals
  FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Providers can insert their own dismissals"
  ON public.provider_job_dismissals
  FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Providers can delete their own dismissals"
  ON public.provider_job_dismissals
  FOR DELETE USING (auth.uid() = provider_id);
