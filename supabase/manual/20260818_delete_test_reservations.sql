-- ==============================================================================
-- 刪除測試預約記錄 (Delete Specified Test Reservations)
-- 執行方式：在 Supabase Dashboard -> SQL Editor 中貼上執行
-- ==============================================================================

-- 步驟 1：先確認即將刪除的這幾筆測試預約（預覽檢查）
select 
  id,
  equipment_id,
  requester_name,
  project_name,
  start_time,
  end_time,
  status
from public.reservations
where id in (1, 2, 3, 5, 6, 7, 8, 18);

-- 步驟 2：確認無誤後執行刪除指令（只會刪除指定的測試項目，不影響其他預約）
delete from public.reservations
where id in (1, 2, 3, 5, 6, 7, 8, 18);

-- ------------------------------------------------------------------------------
-- 備註：若 8/2 的「校驗 (ID 23)」與「專案 A (ID 4)」也是測試資料且要一併清除，可改用以下指令：
-- delete from public.reservations where id in (1, 2, 3, 5, 6, 7, 8, 18, 4, 23);
