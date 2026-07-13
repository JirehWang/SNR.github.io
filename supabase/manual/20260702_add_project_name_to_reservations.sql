alter table public.reservations
add column if not exists project_name text not null default '';
