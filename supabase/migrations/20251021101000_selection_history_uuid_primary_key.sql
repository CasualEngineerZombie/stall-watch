-- Align selection_history's primary key with the schema rules.
--
-- WHY. Business tables use UUID primary keys, and generated rows default to
-- gen_random_uuid(). selection_history was the lone business table using a bigint
-- identity because the log is append-only and numeric IDs looked convenient. That
-- exception makes the schema inconsistent and breaks the rule that business primary
-- keys are UUIDs. public.users is the identity mirror of auth.users and intentionally
-- has no local default. The history ID is internal and is not referenced by any other
-- table or by the app.
--
-- WHAT: replace the bigint identity primary key on builder.selection_history.id with a
-- UUID default gen_random_uuid(). Existing rows receive new UUIDs; their old numeric IDs
-- were not exposed and are intentionally discarded.
--
-- ROLLBACK: this is a lossy type change. Restore builder.selection_history from the
-- pre-migration backup; the old bigint values cannot be reconstructed from the UUIDs.

alter table builder.selection_history
  alter column id drop identity;

alter table builder.selection_history
  alter column id type uuid using gen_random_uuid();

alter table builder.selection_history
  alter column id set default gen_random_uuid();

comment on column builder.selection_history.id is
  'Internal UUID identifier; history is append-only and this value is not exposed by the app.';
