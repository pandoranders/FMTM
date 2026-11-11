-- FMTM shared todo list: Google sign-in, one administrator, and invited members.
-- Replace the email below with the Google account that should own the app before running.

create table if not exists public.app_members (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('admin', 'member')),
  is_owner boolean not null default false,
  added_at timestamptz not null default now(),
  constraint app_members_owner_is_admin check (not is_owner or role = 'admin')
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.fmtm_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_members m
    where m.email = lower((select auth.jwt() ->> 'email'))
      and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
  );
$$;

create or replace function public.fmtm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_members m
    where m.email = lower((select auth.jwt() ->> 'email'))
      and m.role = 'admin'
      and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
  );
$$;

alter table public.app_members enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "Members can read their own access" on public.app_members;
create policy "Members can read their own access"
  on public.app_members for select to authenticated
  using (
    (email = lower((select auth.jwt() ->> 'email'))
      and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google')
    or (select public.fmtm_is_admin())
  );

drop policy if exists "Admins can add members" on public.app_members;
create policy "Admins can add members"
  on public.app_members for insert to authenticated
  with check ((select public.fmtm_is_admin()) and role = 'member' and not is_owner);

drop policy if exists "Admins can remove members" on public.app_members;
create policy "Admins can remove members"
  on public.app_members for delete to authenticated
  using ((select public.fmtm_is_admin()) and role = 'member' and not is_owner);

drop policy if exists "Members can read tasks" on public.tasks;
create policy "Members can read tasks"
  on public.tasks for select to authenticated
  using ((select public.fmtm_is_member()));

drop policy if exists "Members can add tasks" on public.tasks;
create policy "Members can add tasks"
  on public.tasks for insert to authenticated
  with check ((select public.fmtm_is_member()));

drop policy if exists "Members can update tasks" on public.tasks;
create policy "Members can update tasks"
  on public.tasks for update to authenticated
  using ((select public.fmtm_is_member()))
  with check ((select public.fmtm_is_member()));

drop policy if exists "Members can delete tasks" on public.tasks;
create policy "Members can delete tasks"
  on public.tasks for delete to authenticated
  using ((select public.fmtm_is_member()));

grant select, insert, delete on public.app_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
revoke all on function public.fmtm_is_member() from public, anon;
revoke all on function public.fmtm_is_admin() from public, anon;
grant execute on function public.fmtm_is_member() to authenticated;
grant execute on function public.fmtm_is_admin() to authenticated;

-- Only the owner row is an administrator. Admins can add and remove members,
-- but the policies above prevent them from changing or deleting the owner row.
insert into public.app_members (email, role, is_owner)
values ('REPLACE_WITH_YOUR_GOOGLE_EMAIL', 'admin', true)
on conflict (email) do update set role = 'admin', is_owner = true;

-- Enable realtime updates for the shared task list (safe to run more than once).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end;
$$;

