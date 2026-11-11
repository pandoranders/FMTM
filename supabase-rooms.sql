-- Run once in the Supabase SQL Editor to enable room and subtask organization.
begin;

alter table public.tasks
  add column if not exists room text not null default 'annet',
  add column if not exists parent_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_parent_id_idx on public.tasks(parent_id);

create table if not exists public.rooms (
  id text primary key,
  name text not null check (char_length(trim(name)) between 1 and 80),
  layout_column smallint not null check (layout_column in (1, 2)),
  sort_order integer not null default 0
);

alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;
grant select, insert, delete on public.rooms to authenticated;
grant update (name) on public.rooms to authenticated;

drop policy if exists "FMTM account can read rooms" on public.rooms;
create policy "FMTM account can read rooms"
  on public.rooms for select to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

drop policy if exists "FMTM account can manage rooms" on public.rooms;
create policy "FMTM account can manage rooms"
  on public.rooms for all to authenticated
  using (
    id <> 'annet'
    and (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  )
  with check (
    id <> 'annet'
    and (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

do $$
begin
  -- Seed only when installing the foreign key, so rerunning the migration
  -- does not bring back rooms the owner has deleted.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_room_fkey'
  ) then
    insert into public.rooms (id, name, layout_column, sort_order) values
      ('kjokken', 'Kjøkken', 1, 10),
      ('loftsstue', 'Loftsstue', 1, 20),
      ('stue', 'Stue', 2, 10),
      ('elli', 'Rommet til Elli', 2, 20),
      ('walk-in', 'Walk-in', 2, 30),
      ('annet', 'Uten rom', 1, 2147483647)
    on conflict (id) do nothing;

    update public.tasks set room = 'annet'
      where not exists (select 1 from public.rooms where rooms.id = tasks.room);

    alter table public.tasks
      add constraint tasks_room_fkey foreign key (room)
      references public.rooms (id) on delete set default;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end;
$$;

create index if not exists tasks_room_idx on public.tasks(room);

commit;
