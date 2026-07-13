do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'equipment'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%capacity%'
  loop
    execute format('alter table public.equipment drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.equipment
  alter column capacity drop default,
  alter column capacity type text using capacity::text;

comment on column public.equipment.capacity is '設備容量或可重疊預約上限文字，由建立者自行輸入；前端會取第一個數字作為重疊預約上限，無數字時以 1 計。';
