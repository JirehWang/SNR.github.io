-- ==============================================================================
-- Supabase 設備平面圖定位同步 SQL (Equipment Floorplan Placements)
-- 請在 Supabase Dashboard -> SQL Editor 貼上執行此腳本
-- ==============================================================================

-- 1. 建立 equipment_floorplan_placements 資料表與安全權限 (RLS)
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

-- 2. 匯入 / 同步 17 台實驗室設備之預設平面圖定位座標 (Upsert)
insert into public.equipment_floorplan_placements (
  equipment_id, x_percent, y_percent, width_percent, height_percent, location_state, updated_at
)
values
  (13, 68.80, 29.22, 5.07, 6.52, 'placed', timezone('utc', now())),
  (1,  59.00, 29.22, 5.26, 6.72, 'placed', timezone('utc', now())),
  (5,  48.35, 29.22, 5.40, 6.52, 'placed', timezone('utc', now())),
  (6,  68.40, 15.88, 5.02, 6.56, 'placed', timezone('utc', now())),
  (7,  58.60, 15.88, 4.61, 7.15, 'placed', timezone('utc', now())),
  (8,  48.15, 15.69, 4.70, 7.15, 'placed', timezone('utc', now())),
  (9,  37.75, 29.41, 5.34, 6.92, 'placed', timezone('utc', now())),
  (10, 27.03, 29.22, 5.27, 6.72, 'placed', timezone('utc', now())),
  (11, 26.85, 15.88, 4.68, 6.55, 'placed', timezone('utc', now())),
  (12, 4.55,  15.23, 13.02, 7.20, 'placed', timezone('utc', now())),
  (2,  82.50, 70.00, 12.50, 8.00, 'placed', timezone('utc', now())),
  (3,  83.20, 2.83,  9.00, 11.90, 'placed', timezone('utc', now())),
  (4,  68.10, 2.83, 10.20,  4.90, 'placed', timezone('utc', now())),
  (14, 12.60, 30.32, 4.67, 11.77, 'placed', timezone('utc', now())),
  (15, 12.69, 42.43, 5.78, 10.58, 'placed', timezone('utc', now())),
  (16, 7.25,  61.02, 4.61,  9.27, 'placed', timezone('utc', now())),
  (17, 78.68, 82.60, 14.33, 8.40, 'placed', timezone('utc', now()))
on conflict (equipment_id) do update set
  x_percent = excluded.x_percent,
  y_percent = excluded.y_percent,
  width_percent = excluded.width_percent,
  height_percent = excluded.height_percent,
  location_state = excluded.location_state,
  updated_at = timezone('utc', now());
