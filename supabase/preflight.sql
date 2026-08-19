-- Development Preview — PREFLIGHT CHECK (read-only)
--
-- Run this FIRST in the Supabase SQL editor. It creates nothing and changes
-- nothing; it only reports whether anything in your project already uses the
-- names the migration wants. Every row returned is a conflict to look at.
-- No rows returned = the migration has a clear field.

-- 1. Tables, views or sequences with a name the migration wants
select 'relation' as kind,
       n.nspname   as schema,
       c.relname   as name,
       case c.relkind
         when 'r' then 'table' when 'v' then 'view' when 'm' then 'materialized view'
         when 'S' then 'sequence' when 'p' then 'partitioned table' else c.relkind::text
       end as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('preview_users', 'preview_shares', 'preview_share_invites')

union all

-- 2. Functions with the name the migration wants
select 'function',
       n.nspname,
       p.proname,
       pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('preview_increment_share_views')

union all

-- 3. Indexes and constraints with the names the migration wants
select 'index',
       schemaname,
       indexname,
       tablename
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'preview_users_pkey', 'preview_users_provider_unique',
    'preview_shares_pkey', 'preview_shares_owner_idx',
    'preview_share_invites_pkey'
  )

union all

select 'constraint',
       n.nspname,
       con.conname,
       cl.relname
from pg_constraint con
join pg_namespace n on n.oid = con.connamespace
left join pg_class cl on cl.oid = con.conrelid
where n.nspname = 'public'
  and con.conname in (
    'preview_users_provider_unique', 'preview_shares_owner_fk',
    'preview_shares_visibility_check', 'preview_share_invites_share_fk'
  )

order by 1, 3;

-- 4. For context: everything that already lives in your public schema.
-- Nothing here is touched by the migration; this is just so you can eyeball it.
--
-- select table_name, table_type
-- from information_schema.tables
-- where table_schema = 'public'
-- order by table_name;
