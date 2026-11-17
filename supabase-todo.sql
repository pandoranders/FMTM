begin;

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.todo_items enable row level security;

drop policy if exists "FMTM account can manage todo items" on public.todo_items;
create policy "FMTM account can manage todo items"
  on public.todo_items for all to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  )
  with check (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

grant select, insert, update, delete on public.todo_items to authenticated;

commit;
