alter table public.equipment
  add column if not exists requires_test_condition boolean not null default false;

alter table public.equipment
  add column if not exists equipment_spec text not null default '';

alter table public.reservations
  add column if not exists test_condition text not null default '';

comment on column public.equipment.capacity is '同一時段可重疊預約的最大量';
comment on column public.equipment.equipment_spec is '設備規格與操作限制，供設備管理與公佈欄檢視';
comment on column public.equipment.requires_test_condition is '此設備預約時是否必填測試條件';
comment on column public.reservations.test_condition is '本次預約填寫的測試條件';
