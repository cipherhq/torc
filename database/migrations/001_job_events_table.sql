-- Migration: Job Events Table
-- Purpose: Reliable event log for triggering push notifications and tracking job state changes
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.job_events (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'job_created', 'job_accepted', 'job_cancelled', 'job_completed', etc.
  actor_id UUID, -- who triggered this event (provider_id, customer_id, system)
  actor_type TEXT, -- 'provider', 'customer', 'system'
  metadata JSONB, -- extra data: reason, previous_status, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_events_job_id ON public.job_events(job_id);
CREATE INDEX idx_job_events_type ON public.job_events(event_type);
CREATE INDEX idx_job_events_created_at ON public.job_events(created_at DESC);

COMMENT ON TABLE public.job_events IS 'Immutable event log for all job state changes; used to trigger push notifications and audit trails';
COMMENT ON COLUMN public.job_events.event_type IS 'Type of event: job_created, job_accepted, job_cancelled, job_completed, status_changed, etc.';
COMMENT ON COLUMN public.job_events.actor_id IS 'User who triggered the event (provider accepting, customer cancelling, etc.)';
COMMENT ON COLUMN public.job_events.metadata IS 'Extra context: cancellation_reason, previous_status, etc.';

-- RLS: Allow authenticated users to read events for jobs they're involved in
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job events they're involved in"
  ON public.job_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = job_events.job_id
        AND (jobs.customer_id = auth.uid() OR jobs.provider_id = auth.uid())
    )
  );

-- Only the server (service role) should insert events via RPCs
CREATE POLICY "Service role can insert job events"
  ON public.job_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
