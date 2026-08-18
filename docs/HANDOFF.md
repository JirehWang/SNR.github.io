# 維護交接文件

## 系統定位

正式系統是 Windows + Python + SQLite 的內部區網應用。`app/server.py` 同時提供根目錄前端與 `/api`；資料庫為 `data/rlab_reservation.db`。GitHub Pages 與 Supabase 不再是執行環境。

## 重要檔案

```text
index.html / app.js / styles.css     前端
app/server.py                        SQLite schema、本機 API、靜態檔伺服器
data/rlab_reservation.db             正式資料（Git ignored）
scripts/start-local.ps1              本機啟動
scripts/start-lan.ps1                自動偵測 IPv4 的區網啟動
scripts/check-target.ps1             環境、port、DB 檢查
scripts/backup-local.ps1             停機後資料庫備份
scripts/package.ps1                  建立含 DB 的敏感移轉 ZIP
scripts/sync_supabase_to_sqlite.py   一次性 Supabase 匯出工具
supabase/                             舊 schema 與 SQL 歷史參考
```

## 資料移轉基準

2026-07-20 已從 Supabase 匯出並核對：

- equipment：16
- reservations：8
- reservation_history：11
- requester_directory：7
- SQLite `PRAGMA foreign_key_check`：0 筆錯誤

原始 JSON 與同步 SQLite 保留在本機 `data/` 且不進 Git。正式本機 DB 是由同步 SQLite 複製而來。

若切換日前需要再次同步，從 Supabase 專案設定取得 URL 與 anon key，只放在目前 PowerShell 行程：

```powershell
$env:SNR_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SNR_SUPABASE_ANON_KEY = "<anon-key>"
python .\scripts\sync_supabase_to_sqlite.py --replace
Remove-Item Env:SNR_SUPABASE_URL
Remove-Item Env:SNR_SUPABASE_ANON_KEY
```

核對筆數與外鍵後，停止舊站寫入及本機服務，再將 `data\rlab_reservation.synced.db` 複製為正式 `data\rlab_reservation.db`。不要在兩邊同時接受新增或修改。

## 本機規則

- 預約與設備資料只讀寫同源 `/api`。
- 建立／修改／取消／完成預約時，由伺服器在同一交易寫入歷程。
- 重疊上限在伺服器端用 `capacity` 第一個數字判定。
- 設備要求測試條件時，由伺服器再次驗證，不只依賴前端。
- 公佈欄色條依真實時間定位並顯示專案、測試人、時間。

## 維護與發布

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

移轉 ZIP 包含正式 DB，不可放到公開 GitHub、Email 公開群組或未核准雲端空間。程式更新時，預設保留目標電腦正在使用的 DB；只有明確執行資料切換時才可替換。

## 已知邊界

- 目前沒有登入／角色權限，本次依使用者要求不調整權限；只適合受控公司內網。
- SQLite 適合目前規模的多人預約，寫入由交易序列化；目標電腦關機時所有人都無法使用。
- 若要高可用、跨站或大量同時寫入，需另行評估，不在目前落地範圍。
- Supabase 舊站在正式切換後應改為唯讀或停用，避免資料分岔。

## 交接檢查

- [ ] 固定 IP／內部 DNS、port 與防火牆範圍已記錄
- [ ] 目標電腦與資料庫備份責任人已指定
- [ ] 完全離線瀏覽與新增／取消預約驗收完成
- [ ] 開機啟動與故障重啟方式已交接
- [ ] Supabase 最終同步時間與舊站停寫時間已記錄
- [ ] 至少一份 DB 備份存放於另一個核准位置
