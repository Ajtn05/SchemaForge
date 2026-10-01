-- Run once in the Supabase SQL Editor before enabling email sign-in.
create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  schema jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_id_idx on public.projects (owner_id);
alter table public.projects enable row level security;
grant select, insert, update, delete on public.projects to authenticated;
revoke all on public.projects from anon;

create policy "Owners can read their projects" on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can create their projects" on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners can update their projects" on public.projects
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Owners can delete their projects" on public.projects
  for delete to authenticated using ((select auth.uid()) = owner_id);
