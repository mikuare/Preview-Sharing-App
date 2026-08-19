-- Development Preview — per-user projects.
--
-- Adds the workspaces a signed-in user owns, so uploads live with the account
-- rather than in one browser's local storage. Same rules as the first
-- migration: `preview_` prefixed, CREATE-only, idempotent, and it touches
-- nothing belonging to any other application.

create table if not exists public.preview_projects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  name       text not null default 'Untitled project',
  workspace  jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preview_projects_owner_fk
    foreign key (owner_id) references public.preview_users (id) on delete cascade
);

create index if not exists preview_projects_owner_idx
  on public.preview_projects (owner_id, updated_at desc);

-- A share can point back at the project it came from. Nullable, and set null on
-- delete, so deleting a project never breaks a link someone already has.
alter table public.preview_shares
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'preview_shares_project_fk'
  ) then
    alter table public.preview_shares
      add constraint preview_shares_project_fk
      foreign key (project_id) references public.preview_projects (id) on delete set null;
  end if;
end
$$;

alter table public.preview_projects enable row level security;

revoke all on table public.preview_projects from anon, authenticated;
grant all on table public.preview_projects to service_role;

-- ─── What this created ─────────────────────────────────────────────────────
--   table       preview_projects
--   indexes     preview_projects_pkey, preview_projects_owner_idx
--   column      preview_shares.project_id (nullable)
--   constraint  preview_shares_project_fk
--   policies    none — RLS enabled with zero policies, service_role only
