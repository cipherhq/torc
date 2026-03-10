-- Add photo columns to jobs table for service completion photos
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completion_photo_url TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider_photo_urls JSONB DEFAULT '[]'::jsonb;

-- Create the job-photos storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to job-photos bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated uploads to job-photos'
  ) THEN
    CREATE POLICY "Allow authenticated uploads to job-photos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'job-photos');
  END IF;
END $$;

-- Allow public read access to job-photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read of job-photos'
  ) THEN
    CREATE POLICY "Allow public read of job-photos"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'job-photos');
  END IF;
END $$;
