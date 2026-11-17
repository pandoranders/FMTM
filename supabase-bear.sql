begin;

create table if not exists public.bear_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table public.bear_messages enable row level security;
revoke all on public.bear_messages from anon, authenticated;
grant select, insert, delete on public.bear_messages to authenticated;

drop policy if exists "FMTM account can read bear messages" on public.bear_messages;
create policy "FMTM account can read bear messages"
  on public.bear_messages for select to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

drop policy if exists "FMTM account can publish bear messages" on public.bear_messages;
create policy "FMTM account can publish bear messages"
  on public.bear_messages for insert to authenticated
  with check (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

drop policy if exists "FMTM account can delete bear messages" on public.bear_messages;
create policy "FMTM account can delete bear messages"
  on public.bear_messages for delete to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

commit;
