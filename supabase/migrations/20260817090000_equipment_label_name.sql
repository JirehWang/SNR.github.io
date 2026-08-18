alter table public.equipment
  add column if not exists label_name text not null default '';

comment on column public.equipment.label_name is '平面圖設備方塊顯示用短名稱；正式設備名稱仍使用 name。';
