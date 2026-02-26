-- Ensure profile name/contact columns exist for app profile updates.
-- This prevents PostgREST schema-cache errors like:
-- "Could not find the 'first_name' column of 'profiles' in the schema cache"

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Backfill full_name where missing from first/last values.
UPDATE public.profiles
SET full_name = NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), '')
WHERE (full_name IS NULL OR BTRIM(full_name) = '')
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- Force PostgREST (Supabase API) to reload table metadata immediately.
NOTIFY pgrst, 'reload schema';
