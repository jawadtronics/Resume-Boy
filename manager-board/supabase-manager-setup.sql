-- Resume Boy manager board setup
-- Run in Supabase SQL editor after creating the manager user in Auth.
-- Replace manager@example.com with the manager user's real email.

alter table public.profile
  add column if not exists role text not null default 'user';

update public.profile
set role = 'manager'
where lower(email) = lower('manager@example.com');

create index if not exists profile_role_idx on public.profile (role);
create index if not exists project_notes_user_created_idx on public.project_notes (user_id, created_at desc);
