-- Fix: Admin users cannot read jobs table due to missing RLS policy.
-- The jobs table has RLS enabled but no policy granting admin access,
-- so admin dashboard pages (Payouts, Jobs, Payments, Analytics, etc.)
-- all return empty results.

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Allow customers and providers to read their own jobs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Users can view own jobs'
  ) THEN
    CREATE POLICY "Users can view own jobs"
      ON public.jobs
      FOR SELECT
      USING (
        auth.uid() = customer_id
        OR auth.uid() = provider_id
      );
  END IF;
END $$;

-- Allow customers to create jobs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Customers can create jobs'
  ) THEN
    CREATE POLICY "Customers can create jobs"
      ON public.jobs
      FOR INSERT
      WITH CHECK (auth.uid() = customer_id);
  END IF;
END $$;

-- Allow involved users to update their jobs (status changes, ratings, etc.)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Involved users can update jobs'
  ) THEN
    CREATE POLICY "Involved users can update jobs"
      ON public.jobs
      FOR UPDATE
      USING (
        auth.uid() = customer_id
        OR auth.uid() = provider_id
      );
  END IF;
END $$;

-- Admin full access: read all jobs for dashboard, payouts, analytics, etc.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Admins have full access to jobs'
  ) THEN
    CREATE POLICY "Admins have full access to jobs"
      ON public.jobs
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

-- Also ensure providers can see pending jobs for dispatch/matching
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Providers can view pending jobs'
  ) THEN
    CREATE POLICY "Providers can view pending jobs"
      ON public.jobs
      FOR SELECT
      USING (
        status = 'pending'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role = 'provider'
        )
      );
  END IF;
END $$;
