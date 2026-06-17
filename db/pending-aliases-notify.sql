-- =====================================================================
-- PENDING ALIASES -- notification layer (additive, run after pending-aliases.sql)
-- =====================================================================
-- Adds the columns needed to notify the uploader once an admin reviews
-- their suggestion:
--   review_note   -- optional admin message shown on reject (defaults handled in app)
--   acknowledged  -- uploader has dismissed the notification (hides it)
-- =====================================================================
alter table pending_aliases add column if not exists review_note  text;
alter table pending_aliases add column if not exists acknowledged boolean not null default false;
