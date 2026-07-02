insert into public.equipment (name, category, location, status, capacity, is_active)
values
  ('Drop Tester', 'DROP', 'Reliability Lab 2F', 'available', 1, true),
  ('ESD Test Bench', 'ESD', 'Reliability Lab 1F', 'available', 1, true),
  ('Thermal Chamber A', 'TEMP', 'Reliability Lab 1F', 'validation', 1, true),
  ('Vibration Table', 'VIBRATION', 'Reliability Lab 2F', 'maintenance', 1, true)
on conflict do nothing;
