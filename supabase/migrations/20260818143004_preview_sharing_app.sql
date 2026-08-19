-- Development Preview — share storage
-- Applied with: npm run db:push  (supabase db push)
--
-- Safe to run against a project that already hosts other applications:
--   * every object created is prefixed `preview_`
--   * CREATE only — no DROP, no TRUNCATE, no DELETE, and no ALTER of anything
--     that already exists
--   * idempotent — re-running changes nothing
--
-- Run supabase/preflight.sql in the SQL editor first if you want to confirm the
-- names are free; the Supabase CLI wraps this file in a transaction, so a
-- failure leaves the database untouched.

-- ─── Tables ────────────────────────────────────────────────────────────────
-- gen_random_uuid() is core Postgres 13+, so no extension is installed here.

create table if not exists public.preview_users (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null,
  provider_id text not null,
  email       text,
  name        text,
  avatar      text,
  created_at  timestamptz not null default now(),
  constraint preview_users_provider_unique unique (provider, provider_id)
);

create table if not exists public.preview_shares (
  slug         text primary key,
  owner_id     uuid not null,
  title        text not null,
  visibility   text not null default 'invite',
  workspace    jsonb not null,
  preview_html text,
  views        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint preview_shares_owner_fk
    foreign key (owner_id) references public.preview_users (id) on delete cascade,
  constraint preview_shares_visibility_check
    check (visibility in ('public', 'invite'))
);

create table if not exists public.preview_share_invites (
  slug  text not null,
  email text not null,
  constraint preview_share_invites_pkey primary key (slug, email),
  constraint preview_share_invites_share_fk
    foreign key (slug) references public.preview_shares (slug) on delete cascade
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

create index if not exists preview_shares_owner_idx
  on public.preview_shares (owner_id, updated_at desc);

-- ─── Functions ─────────────────────────────────────────────────────────────
-- One statement, so concurrent viewers cannot lose a view count.
-- This is the only CREATE OR REPLACE in the file; preflight.sql reports whether
-- a function of this name already exists.

create or replace function public.preview_increment_share_views(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.preview_shares set views = views + 1 where slug = p_slug;
$$;

-- ─── Access control ────────────────────────────────────────────────────────
-- RLS on with NO policies: the anon and publishable keys can read nothing here
-- even if one leaks into a browser. The share server uses the service_role key,
-- which bypasses RLS by design. Supabase grants new public tables to anon and
-- authenticated by default, so those grants are revoked for these three tables
-- only — no other table's privileges are touched.

alter table public.preview_users         enable row level security;
alter table public.preview_shares        enable row level security;
alter table public.preview_share_invites enable row level security;

revoke all on table
  public.preview_users,
  public.preview_shares,
  public.preview_share_invites
from anon, authenticated;

grant all on table
  public.preview_users,
  public.preview_shares,
  public.preview_share_invites
to service_role;

revoke all on function public.preview_increment_share_views(text) from anon, authenticated;
grant execute on function public.preview_increment_share_views(text) to service_role;

-- ─── What this created ─────────────────────────────────────────────────────
--   tables    preview_users, preview_shares, preview_share_invites
--   indexes   preview_users_pkey, preview_users_provider_unique,
--             preview_shares_pkey, preview_shares_owner_idx,
--             preview_share_invites_pkey
--   function  preview_increment_share_views(text)
--   policies  none — RLS is enabled with zero policies, which denies every
--             role except service_role (which bypasses RLS)
--   triggers  none
