# Reliability Lab Reservation

可靠度實驗室設備預約系統。正式前端是 GitHub Pages 根目錄的 Supabase 版本；`app/server.py` 是保留的本機 SQLite fallback 與 API 測試 harness。

## 快速入口

- Hosted frontend: [index.html](index.html)
- Bulletin view: [index.html?view=bulletin](index.html?view=bulletin)
- Frontend code: [app.js](app.js), [styles.css](styles.css)
- Supabase SQL scripts: [supabase/manual](supabase/manual)
- Full handoff: [docs/HANDOFF.md](docs/HANDOFF.md)

## GitHub Pages

Pages source 使用 `main` branch、`/(root)`。推送後由 GitHub Pages 自動發布。

## Supabase

新環境或欄位尚未建立時，依 [docs/HANDOFF.md](docs/HANDOFF.md) 的順序在 Supabase SQL Editor 執行必要腳本。特別是設備規格欄位來自 `20260702_equipment_overlap_and_test_condition.sql`。

## 本機驗證

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

## 本機 fallback

```powershell
python -m app.server --host 127.0.0.1 --port 8000
```

本機 fallback 主要用於 SQLite API 與測試；根目錄前端正式資料來源是 Supabase。
