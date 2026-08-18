create table if not exists public.equipment_floorplan_placements (
  equipment_id bigint primary key references public.equipment (id) on delete cascade,
  x_percent numeric(6, 2) not null check (x_percent >= 0 and x_percent <= 100),
  y_percent numeric(6, 2) not null check (y_percent >= 0 and y_percent <= 100),
  width_percent numeric(6, 2) not null check (width_percent > 0 and width_percent <= 100),
  height_percent numeric(6, 2) not null check (height_percent > 0 and height_percent <= 100),
  location_state text not null default 'placed' check (location_state in ('unplaced', 'placing', 'placed')),
  updated_at timestamptz not null default timezone('utc', now()),
  check (x_percent + width_percent <= 100),
  check (y_percent + height_percent <= 100)
);

create index if not exists idx_equipment_floorplan_placements_updated_at
  on public.equipment_floorplan_placements (updated_at desc);

drop trigger if exists trg_equipment_floorplan_placements_updated_at on public.equipment_floorplan_placements;
create trigger trg_equipment_floorplan_placements_updated_at
before update on public.equipment_floorplan_placements
for each row
execute function public.set_updated_at();

alter table public.equipment_floorplan_placements enable row level security;

grant select, insert, update on table public.equipment_floorplan_placements to anon, authenticated;

drop policy if exists "equipment_floorplan_public_read" on public.equipment_floorplan_placements;
create policy "equipment_floorplan_public_read"
on public.equipment_floorplan_placements
for select
to anon, authenticated
using (true);

drop policy if exists "equipment_floorplan_public_write" on public.equipment_floorplan_placements;
create policy "equipment_floorplan_public_write"
on public.equipment_floorplan_placements
for insert
to anon, authenticated
with check (true);

drop policy if exists "equipment_floorplan_public_update" on public.equipment_floorplan_placements;
create policy "equipment_floorplan_public_update"
on public.equipment_floorplan_placements
for update
to anon, authenticated
using (true)
with check (true);
