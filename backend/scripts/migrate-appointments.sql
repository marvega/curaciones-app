-- Phase 2: Migrate existing appointment data from curaciones to appointments table
-- PREREQUISITES: Phase 1 must be deployed (appointments table exists)

-- Step 1: Pre-check for duplicate slots
SELECT "nextAppointmentDate" as date, "nextAppointmentTime" as time, COUNT(*) as count
FROM curaciones
WHERE "nextAppointmentDate" IS NOT NULL AND "nextAppointmentTime" IS NOT NULL
GROUP BY "nextAppointmentDate", "nextAppointmentTime"
HAVING COUNT(*) > 1;

-- Step 2: If no duplicates found (or after resolving them), run migration:
BEGIN;

INSERT INTO appointments ("patientId", "curacionId", date, time, "createdAt")
SELECT c."patientId", c.id, c."nextAppointmentDate", c."nextAppointmentTime", c."createdAt"
FROM curaciones c
WHERE c."nextAppointmentDate" IS NOT NULL
  AND c."nextAppointmentTime" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM appointments a WHERE a."curacionId" = c.id
  )
ON CONFLICT DO NOTHING;

COMMIT;

-- Step 3: Verify data integrity
-- Count should match:
-- SELECT COUNT(*) FROM curaciones WHERE "nextAppointmentDate" IS NOT NULL AND "nextAppointmentTime" IS NOT NULL;
-- SELECT COUNT(*) FROM appointments WHERE "curacionId" IS NOT NULL;
