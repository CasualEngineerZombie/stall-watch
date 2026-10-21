-- Create the builder and private schemas.
--
-- WHY. Supabase exposes `public` to the Data API by default, and several apps share this
-- database. Builder data belongs to external customers, so it gets its own schema that
-- we expose deliberately (see supabase/config.toml and SETUP.md). RLS helpers and
-- trigger functions live in `private`, which is never exposed, so they cannot be reached
-- over /rest/v1/rpc even if a grant is missed.
--
-- WHAT.
-- 1. schema builder — builder-facing tables, detector log and the stall view.
-- 2. schema private — RLS helpers and trigger functions.
-- 3. usage grants for `authenticated` only (policies run as the caller, so they need
--    usage even though the schema is not exposed).
--
-- ROLLBACK:
--   drop schema builder cascade;
--   drop schema private cascade;

create schema if not exists builder;
create schema if not exists private;

comment on schema builder is
  'Builder-facing data and detector internals. Exposed through the Data API with RLS.';
comment on schema private is
  'RLS helpers and trigger functions. Never exposed through the Data API.';

grant usage on schema builder to authenticated;
grant usage on schema private to authenticated;
