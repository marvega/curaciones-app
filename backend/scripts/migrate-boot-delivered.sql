-- Add bootDelivered column to curaciones (ayuda técnica de descarga / pie diabético)
-- PREREQUISITES: deploy commit including the new bootDelivered field on Curacion entity

BEGIN;

ALTER TABLE curaciones
  ADD COLUMN IF NOT EXISTS "bootDelivered" boolean NOT NULL DEFAULT false;

COMMIT;

-- Verification:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'curaciones' AND column_name = 'bootDelivered';
-- Expected: bootDelivered | boolean | NO | false
