-- Migration 047: Add review tracking columns to documents table.
-- These columns let the admin Documents page track who reviewed each document and when.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
