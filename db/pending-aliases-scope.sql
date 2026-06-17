-- =====================================================================
-- PENDING ALIASES -- room/scope gating (additive, run after notify migration)
-- =====================================================================
-- Notifications are gated by "room" (the uploader's role): institution,
-- ministry, or admin. The dashboard bell shows only the notifications for
-- the currently selected "View as" role. scope is set at submit time from
-- the uploader's role (defaults to 'institution').
-- =====================================================================
alter table pending_aliases add column if not exists scope text not null default 'institution';

create index if not exists idx_pending_aliases_scope on pending_aliases(scope, status);
