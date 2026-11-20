-- FMTM single-account setup: password sign-in for the fixed unibear login.

begin;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "Members can read tasks" on public.tasks;
drop policy if exists "Members can add tasks" on public.tasks;
drop policy if exists "Members can update tasks" on public.tasks;
drop policy if exists "Members can delete tasks" on public.tasks;

-- Remove the old membership table and its policies before dropping the helpers.
drop table if exists public.app_members;
drop function if exists public.fmtm_is_member();
drop function if exists public.fmtm_is_admin();

drop policy if exists "FMTM account can read tasks" on public.tasks;
drop policy if exists "FMTM account can add tasks" on public.tasks;
drop policy if exists "FMTM account can update tasks" on public.tasks;
drop policy if exists "FMTM account can delete tasks" on public.tasks;

create policy "FMTM account can read tasks"
  on public.tasks for select to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

create policy "FMTM account can add tasks"
  on public.tasks for insert to authenticated
  with check (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

create policy "FMTM account can update tasks"
  on public.tasks for update to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  )
  with check (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

create policy "FMTM account can delete tasks"
  on public.tasks for delete to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

grant select, insert, update, delete on public.tasks to authenticated;

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

commit;
