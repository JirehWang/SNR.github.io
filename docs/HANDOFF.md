# 維護交接文件

本文件給下一位維護者使用，目標是讓接手者能在不閱讀完整 Git 歷史的情況下完成部署、欄位更新與基本除錯。

## 1. 系統定位

正式網站是 GitHub Pages 根目錄的靜態前端，前端直接呼叫 Supabase。網站入口是 `index.html`，公佈欄可用 `?view=bulletin` 開啟。

本機的 `app/server.py` 與 `data/` 是 legacy SQLite fallback，保留給 API 測試與離線檢查；它不是正式網站的資料來源。

## 2. 重要檔案

```text
index.html                 GitHub Pages 入口
app.js                     Supabase 查詢、預約、設備管理、公佈欄互動
styles.css                 全站與公佈欄樣式
supabase/manual/           需在 Supabase SQL Editor 手動執行的腳本
supabase/migrations/       Supabase CLI 初始化 schema 參考
app/server.py              SQLite fallback API 與本機測試 server
tests/test_api.py          SQLite API 測試
tests/test_static_ui.py    前端結構回歸測試
scripts/verify.ps1         Windows 驗證入口
project_contract.yml       專案工作約定
```

## 3. Supabase 建置順序

若資料庫 schema 尚未完成，先建立初始 schema，再在 SQL Editor 依序執行：

1. `supabase/migrations/20260702015624_init_schema.sql`（若使用 Supabase CLI，migration 由 CLI 管理；不要在已存在的正式資料庫盲目重跑整份初始化檔）
2. `supabase/manual/20260702_add_project_name_to_reservations.sql`
3. `supabase/manual/20260702_equipment_overlap_and_test_condition.sql`
4. `supabase/manual/20260702_requester_directory.sql`
5. `supabase/manual/20260703_capacity_text.sql`
6. `supabase/manual/20260702_hosted_web_policies.sql`

必要欄位包括：

- `reservations.project_name`
- `reservations.test_condition`
- `equipment.requires_test_condition`
- `equipment.equipment_spec`
- `equipment.capacity`（目前是文字，可輸入例如 `2`、`2槽`、`4 channels`；前端取第一個數字作為可重疊預約量）

`20260702_sample_equipment_seed.sql` 是可選的示範資料。

`20260702_import_sqlite_data.sql` 會 `TRUNCATE` Supabase 的預約與設備資料，只能在確認要覆蓋資料時執行；不要把它當一般 migration。

## 4. 前端功能規則

- 預約與設備資料直接從 Supabase 讀寫。
- 設備管理顯示：類別、位置、可重疊預約量、設備規格、測試條件是否必填。
- 預約送出前會檢查同設備同時段的重疊數是否達 `capacity`。
- 公佈欄的色條依真實起訖時間定位，並在色條內嘗試顯示三行：專案名稱、測試人、測試期間；寬度不足時允許截斷，不可為了文字任意延長到隔天。
- 公佈欄支援 `?view=bulletin`、週次切換、全螢幕、另開視窗與自動捲動。

## 5. 部署流程

1. 確認 Supabase 必要欄位與 policies 已完成。
2. 本機執行 `scripts/verify.ps1`。
3. 將變更提交到 `main` 並推送。
4. 到 GitHub Pages 確認 `main` / `/(root)`。
5. 用無痕視窗開啟網站與 `?view=bulletin`，確認資料連線、設備管理與公佈欄。

## 6. 本機驗證與 fallback

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
python -m app.server --host 127.0.0.1 --port 8000
```

驗證腳本包含：

- `python -m unittest discover -s tests`
- Python compile check
- `node --check app.js`

若要測 SQLite API，使用 `tests/test_api.py`；不要把 SQLite 測試結果當成 Supabase 連線已驗證。

## 7. 常見問題

### `column equipment.equipment_spec does not exist`

在 SQL Editor 執行 `20260702_equipment_overlap_and_test_condition.sql`，再重新整理頁面。前端目前有 fallback：欄位尚未建立時仍可讀取其他設備資料，但設備規格不會保存。

### 公佈欄看不到完整文字

先確認資料有 `project_name`、`requester_name`、`start_time`、`end_time`。短時段色條本來可能不足以容納長文字；不要用 CSS 把色條任意延長，否則會造成跨天誤讀。

### RLS 或資料讀取被拒絕

檢查 `20260702_hosted_web_policies.sql` 是否已執行，以及 policy 是否符合目前的匿名／登入策略。不要把 Supabase service-role key 放進 `app.js`；前端只能使用 anon key。

## 8. 交接檢查清單

- [ ] GitHub Pages `main` / `/(root)` 正常發布
- [ ] Supabase 必要欄位已建立
- [ ] Supabase policies 已依組織規範確認
- [ ] 設備管理可看到並保存設備規格
- [ ] 可重疊預約量能阻止超過上限的重疊預約
- [ ] `?view=bulletin` 可顯示設備、專案、測試人與時間
- [ ] `scripts/verify.ps1` 通過
- [ ] 沒有把 service-role key、SQLite DB 或測試資料推上公開 repo
