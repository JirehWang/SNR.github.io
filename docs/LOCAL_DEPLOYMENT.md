# 完全本機部署指南

本系統部署於一台 Windows 電腦，使用 Python 標準庫提供前端與 API，資料儲存在同機的 SQLite。執行期間不連 Supabase 或 CDN。

## 目標電腦需求

- Windows 10/11 或 Windows Server
- Python 3.10 以上並加入 `PATH`
- 區網模式需要固定 IP／DHCP reservation 或穩定的內部 DNS
- 預設 TCP port 為 `8000`

Node.js、Git、Supabase CLI 與網際網路都不是正式執行需求。

## 首次搬機

1. 在來源專案執行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
   ```

2. 使用公司核准方式將 `artifacts\SNR-reservation-*.zip` 搬到目標電腦。ZIP 內含姓名、Email、設備及預約資料，必須視為敏感資料。
3. 解壓縮後執行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\check-target.ps1
   ```

4. 只供本機使用：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
   ```

5. 供區網使用：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\start-lan.ps1
   ```

   腳本會自動選擇有預設閘道的有效 IPv4，更新 `LAN-ACCESS.txt` 並顯示首頁、公佈欄網址。VPN／多網卡選錯時可用 `-IpAddress 192.168.10.25` 覆寫。

6. 啟動視窗須保持開啟；按 `Ctrl+C` 停止。若需開機自啟，交由資訊人員依公司規範建立排程工作或 Windows 服務。

## 防火牆與使用範圍

- 本機模式不需開放入站連接埠。
- 區網模式只開放實際使用的 TCP port，來源限制在公司內網，不要公開到 Internet。
- 目前沒有新增登入或角色權限；存取邊界依賴公司網路與目標電腦管控。

## 備份與還原

備份前先按 `Ctrl+C` 停止服務，再執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
```

備份會寫入 `backups\rlab_reservation-日期時間.db` 並顯示 SHA256。將備份複製到公司核准的第二儲存位置。

還原時保持服務停止，先保留目前 `data\rlab_reservation.db`，再把選定備份複製回該路徑。啟動後完成下列驗收。

## 驗收清單

- [ ] `check-target.ps1` 全部顯示 `PASS`
- [ ] 首頁顯示「已連線本機資料庫」
- [ ] 設備數量為 16，申請人目錄為 7（以首次同步基準；後續依實際異動）
- [ ] 能建立並取消一筆測試預約
- [ ] 設備規格與可重疊預約量可讀寫
- [ ] `?view=bulletin` 顯示專案、測試人與時間
- [ ] 拔除 Internet 後重新整理仍可操作
- [ ] 另一台區網電腦可連線（若採區網模式）
- [ ] 完成一次停止服務、備份、啟動的演練

## 更新版本

先備份並停止舊服務，再解壓新版本。若更新包含資料庫，不要直接覆蓋目標電腦已持續使用的 DB；程式檔與資料庫必須分開判斷。正式搬機當天若 Supabase 仍有新增資料，需先重新同步並暫停舊網站寫入，避免雙邊資料分岔。
