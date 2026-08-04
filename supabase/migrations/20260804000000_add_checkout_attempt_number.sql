-- Add attempt_number to checkouts for idempotency key versioning on retries
ALTER TABLE checkouts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;
