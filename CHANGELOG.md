# Kidcastle 薪資系統 — 修改記錄

版本格式：`VyyyymmddVhhmm`（例：V20261009V2100 = 2026/10/09 21:00）
每次修改：在最上面新增一筆，並同步更新 index.html 的 `APP_CHANGELOG` 與 Code.gs 的 `BACKEND_CHANGELOG`。

## V20261009V2100（2026-10-09 21:00）
- 新增版本號與「修改記錄」：點系統右下角版本號即可查看；其他頁面右下角也顯示版本號
- 雲端網址改為新部署（AKfycbxipSVJ…），修正 Email 寄送薪資條出現「未知 action: send_payslip」
- 刪除薪水條「特殊項目」與「特殊調整」：薪資條、Email 薪資條、員工資料編輯、本月薪資、主管輸入、加扣薪小計、Excel 匯出、備份欄位、複製上月資料、公式說明
- 後端（Code.gs）新增員工薪資條開放查詢期間：每月 17 日開放（遇週六日或國定假日順延），開放 7 天；老闆可在設定面板（ReadWindowAdmin.html）修改
- 後端新增 `?action=changelog`，`?action=ping` 回傳版本號

## 20261008V2（2026-10-08）
- 新增 Email 寄送薪資條（單筆 / 批次），寄件人 wufatw@gmail.com
