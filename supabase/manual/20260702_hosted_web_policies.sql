grant usage on schema public to anon, authenticated;

grant select, insert, update on table public.equipment to anon, authenticated;
grant select, insert, update on table public.reservations to anon, authenticated;
grant select, insert on table public.reservation_history to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

drop policy if exists "equipment_public_read" on public.equipment;
create policy "equipment_public_read"
on public.equipment
for select
to anon, authenticated
using (true);

drop policy if exists "equipment_public_write" on public.equipment;
create policy "equipment_public_write"
on public.equipment
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "reservations_public_read" on public.reservations;
create policy "reservations_public_read"
on public.reservations
for select
to anon, authenticated
using (true);

drop policy if exists "reservations_public_write" on public.reservations;
create policy "reservations_public_write"
on public.reservations
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "reservation_history_public_read" on public.reservation_history;
create policy "reservation_history_public_read"
on public.reservation_history
for select
to anon, authenticated
using (true);

drop policy if exists "reservation_history_public_insert" on public.reservation_history;
create policy "reservation_history_public_insert"
on public.reservation_history
for insert
to anon, authenticated
with check (true);
