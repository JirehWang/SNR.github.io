begin;

-- SQLite -> Supabase import
-- Assumption: legacy SQLite timestamps were entered in Asia/Taipei local time (+08:00).

truncate table public.reservation_history restart identity cascade;
truncate table public.reservations restart identity cascade;
truncate table public.equipment restart identity cascade;

insert into public.equipment
  (id, name, category, location, status, capacity, is_active, created_at, updated_at)
values
  (1, '環境箱 A', '環境箱', '可靠度實驗室 3F', 'available', 1, true, '2026-07-01 07:25:16+08:00', '2026-07-01 07:25:16+08:00'),
  (2, 'ESD 測試機', 'ESD', '可靠度實驗室 3F', 'available', 1, true, '2026-07-01 07:25:16+08:00', '2026-07-01 07:25:16+08:00'),
  (3, 'Drop Tester', 'DROP', '可靠度實驗室 3F', 'available', 1, true, '2026-07-01 07:25:16+08:00', '2026-07-01 07:25:16+08:00'),
  (4, 'Vibration Table', 'VIBRATION', '可靠度實驗室 3F', 'maintenance', 1, true, '2026-07-01 07:25:16+08:00', '2026-07-01 07:25:16+08:00'),
  (5, '環境箱 B', '環境箱', '可靠度實驗室3F', 'available', 1, true, '2026-07-01 07:45:39+08:00', '2026-07-01 07:45:39+08:00');

insert into public.reservations
  (
    id,
    equipment_id,
    requester_name,
    requester_email,
    department,
    project_name,
    purpose,
    start_time,
    end_time,
    status,
    approval_status,
    checked_in_at,
    checked_out_at,
    notes,
    cancel_reason,
    created_at,
    updated_at
  )
values
  (
    1,
    3,
    '黃健勝',
    '105221@senao.com',
    '可靠度實驗室',
    '',
    '可靠度驗證',
    '2026-07-01T16:00:00+08:00',
    '2026-07-01T18:00:00+08:00',
    'cancelled',
    'not_required',
    null,
    null,
    '',
    '行程異動',
    '2026-07-01 07:26:28+08:00',
    '2026-07-01 07:29:23+08:00'
  ),
  (
    2,
    3,
    'Hank',
    'test@123.com',
    '可靠度實驗室',
    '',
    '可靠度驗證',
    '2026-07-06T16:00:00+08:00',
    '2026-07-10T18:00:00+08:00',
    'reserved',
    'not_required',
    null,
    null,
    '',
    null,
    '2026-07-01 07:44:17+08:00',
    '2026-07-01 07:44:17+08:00'
  );

insert into public.reservation_history
  (
    id,
    reservation_id,
    action,
    old_value,
    new_value,
    changed_by,
    changed_by_name,
    changed_at
  )
values
  (
    1,
    1,
    'created',
    null,
    '{"equipment_id": 3, "requester_name": "黃健勝", "requester_email": "105221@senao.com", "department": "可靠度實驗室", "start_time": "2026-07-01T16:00", "end_time": "2026-07-01T18:00", "purpose": "可靠度驗證", "notes": ""}'::jsonb,
    null,
    '黃健勝',
    '2026-07-01 07:26:28+08:00'
  ),
  (
    2,
    1,
    'cancelled',
    '{"id": 1, "equipment_id": 3, "requester_name": "黃健勝", "requester_email": "105221@senao.com", "department": "可靠度實驗室", "purpose": "可靠度驗證", "start_time": "2026-07-01T16:00", "end_time": "2026-07-01T18:00", "status": "reserved", "approval_status": "not_required", "checked_in_at": null, "checked_out_at": null, "notes": "", "cancel_reason": null, "created_at": "2026-07-01 07:26:28", "updated_at": "2026-07-01 07:26:28", "equipment_name": "Drop Tester", "equipment_category": "DROP"}'::jsonb,
    '{"id": 1, "equipment_id": 3, "requester_name": "黃健勝", "requester_email": "105221@senao.com", "department": "可靠度實驗室", "purpose": "可靠度驗證", "start_time": "2026-07-01T16:00", "end_time": "2026-07-01T18:00", "status": "cancelled", "approval_status": "not_required", "checked_in_at": null, "checked_out_at": null, "notes": "", "cancel_reason": "行程異動", "created_at": "2026-07-01 07:26:28", "updated_at": "2026-07-01 07:29:23", "equipment_name": "Drop Tester", "equipment_category": "DROP"}'::jsonb,
    null,
    '黃健勝',
    '2026-07-01 07:29:23+08:00'
  ),
  (
    3,
    2,
    'created',
    null,
    '{"equipment_id": 3, "requester_name": "Hank", "requester_email": "test@123.com", "department": "可靠度實驗室", "start_time": "2026-07-06T16:00", "end_time": "2026-07-10T18:00", "purpose": "可靠度驗證", "notes": ""}'::jsonb,
    null,
    'Hank',
    '2026-07-01 07:44:17+08:00'
  );

select setval(pg_get_serial_sequence('public.equipment', 'id'), coalesce((select max(id) from public.equipment), 1), true);
select setval(pg_get_serial_sequence('public.reservations', 'id'), coalesce((select max(id) from public.reservations), 1), true);
select setval(pg_get_serial_sequence('public.reservation_history', 'id'), coalesce((select max(id) from public.reservation_history), 1), true);

commit;
