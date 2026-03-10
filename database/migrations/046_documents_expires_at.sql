-- Migration 046: Add expires_at column to documents table.
-- Allows providers and admins to track document expiration dates.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS expires_at DATE;
