-- Repair missing FK constraints on staff/enrolment (PostgREST needs these for
-- embedded selects like countries(name)). Safe to re-run.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_school_id_fkey') THEN
    ALTER TABLE staff
      ADD CONSTRAINT staff_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_country_id_fkey') THEN
    ALTER TABLE staff
      ADD CONSTRAINT staff_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrolment_school_id_fkey') THEN
    ALTER TABLE enrolment
      ADD CONSTRAINT enrolment_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrolment_country_id_fkey') THEN
    ALTER TABLE enrolment
      ADD CONSTRAINT enrolment_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id);
  END IF;
END $$;

-- Nudge PostgREST to reload its schema cache (Supabase listens for this).
NOTIFY pgrst, 'reload schema';
