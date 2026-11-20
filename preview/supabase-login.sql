begin;

create table if not exists public.fmtm_login (
  id boolean primary key default true check (id),
  username text not null check (username = trim(username) and char_length(username) between 1 and 60)
);

alter table public.fmtm_login enable row level security;
revoke all on public.fmtm_login from anon, authenticated;
grant select (username) on public.fmtm_login to anon, authenticated;

drop policy if exists "FMTM username is visible at sign-in" on public.fmtm_login;
create policy "FMTM username is visible at sign-in"
  on public.fmtm_login for select to anon, authenticated
  using (true);

insert into public.fmtm_login (id, username)
values (true, 'unibear')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;
