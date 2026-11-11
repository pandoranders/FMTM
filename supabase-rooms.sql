-- Run once in the Supabase SQL Editor to enable room and subtask organization.
begin;

alter table public.tasks
  add column if not exists room text not null default 'annet',
  add column if not exists parent_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_parent_id_idx on public.tasks(parent_id);

commit;
