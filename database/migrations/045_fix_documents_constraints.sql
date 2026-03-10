-- Migration 045: Fix documents table constraints.
--
-- Problems:
-- 1. documents_provider_id_fkey references providers(id) but the app uses auth.uid()
--    as provider_id, which matches provider_profiles(id). The providers table is empty.
-- 2. documents_type_check only allows: license, insurance, registration, certification,
--    towing_cert — but document_types table uses 'towing' not 'towing_cert'.
-- 3. Stale RLS policies reference the old providers table.

-- 1. Fix FK: drop old FK referencing providers, add new FK referencing auth.users
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_provider_id_fkey;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Fix CHECK constraint: drop old and add updated one with all valid types
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_type_check
  CHECK (type::text = ANY(ARRAY[
    'license', 'insurance', 'registration', 'certification',
    'towing_cert', 'towing', 'background_check', 'w9', 'other'
  ]));

-- 3. Drop stale RLS policies that reference the old providers table
DROP POLICY IF EXISTS "Providers can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Providers can view own documents" ON public.documents;
