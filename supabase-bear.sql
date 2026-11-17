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

alter table public.bear_messages
  add column if not exists heart_count bigint not null default 0 check (heart_count >= 0);

create or replace function public.add_bear_heart(message_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $bear_heart$
declare
  updated_count bigint;
begin
  if (auth.jwt() ->> 'email') is distinct from 'pandoranders@gmail.com'
    or (auth.jwt() -> 'app_metadata' ->> 'provider') is distinct from 'email' then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  update public.bear_messages
    set heart_count = heart_count + 1
    where id = message_id
    returning heart_count into strict updated_count;
  return updated_count;
end;
$bear_heart$;

revoke all on function public.add_bear_heart(uuid) from public, anon;
grant execute on function public.add_bear_heart(uuid) to authenticated;

alter table public.bear_messages
  add column if not exists fire_count bigint not null default 0 check (fire_count >= 0),
  add column if not exists bear_count bigint not null default 0 check (bear_count >= 0),
  add column if not exists unicorn_count bigint not null default 0 check (unicorn_count >= 0);

create or replace function public.add_bear_reaction(message_id uuid, reaction text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $reaction$
declare
  updated_count bigint;
begin
  if (auth.jwt() ->> 'email') is distinct from 'pandoranders@gmail.com'
    or (auth.jwt() -> 'app_metadata' ->> 'provider') is distinct from 'email' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if reaction not in ('fire', 'heart', 'bear', 'unicorn') or reaction is null then
    raise exception 'Invalid reaction';
  end if;
  execute format('update public.bear_messages set %1$I = %1$I + 1 where id = $1 returning %1$I', reaction || '_count')
    into strict updated_count using message_id;
  return updated_count;
end;
$reaction$;
revoke all on function public.add_bear_reaction(uuid, text) from public, anon;
grant execute on function public.add_bear_reaction(uuid, text) to authenticated;

commit;
