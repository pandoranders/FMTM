begin;

create table if not exists public.ritulas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  completed_on date,
  created_at timestamptz not null default now()
);

alter table public.ritulas enable row level security;

drop policy if exists "FMTM account can manage ritulas" on public.ritulas;
create policy "FMTM account can manage ritulas"
  on public.ritulas for all to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  )
  with check (
    (select auth.jwt() ->> 'email') = 'pandoranders@gmail.com'
    and (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'email'
  );

grant select, insert, update, delete on public.ritulas to authenticated;

commit;
