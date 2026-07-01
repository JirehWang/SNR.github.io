# 可靠度實驗室設備預約 MVP

部門內暫用版設備預約系統。此版本包含前端、後端 API、SQLite 資料庫與基本測試。

## 目前功能

- 設備清單與狀態
- 新增設備
- 修改設備狀態：可預約 / 維修中 / 停用
- Dashboard 摘要：設備總數、本週預約、維修中、停用
- 本週預約檢視
- 設備使用甘特圖
- 建立預約
- 同設備同時段防重覆預約
- 取消預約並保留取消原因
- 預約歷史表預留稽核紀錄

## 技術選型

- Frontend: HTML / CSS / JavaScript
- Backend: Python standard library HTTP server
- Database: SQLite

此 MVP 不需安裝外部套件。

## 啟動

```powershell
cd SNR.github.io
python -m app.server --host 127.0.0.1 --port 8000
```

打開：

```text
http://127.0.0.1:8000
```

資料庫會自動建立在：

```text
app/../data/rlab_reservation.db
```

## 測試

```powershell
python -m unittest discover -s tests
```

## 資料儲存

目前版本只使用本機 SQLite，不透過 Excel 儲存。

```text
data\rlab_reservation.db
```

前端畫面會透過後端 API 讀寫 SQLite，並即時顯示設備清單、本週預約、預約明細與甘特圖。

如果後續要給整個部門多人長期使用，建議把 SQLite 遷移到 SQL Server、PostgreSQL 或 Azure SQL，並把 Web App 架在內部主機或公司雲端環境。

## 後續擴充

- AD / SSO 登入
- Email 通知
- 審核流程
- QR Code 報到
- 維修停機
- 報表匯出
- SQL Server / PostgreSQL / Azure SQL 遷移
