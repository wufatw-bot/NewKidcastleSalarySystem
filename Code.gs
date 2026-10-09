/**
 * Kidcastle Salary System — Google Drive Backend (Apps Script Web App)
 * 版本：V20261009V2100（修改記錄見最下方 BACKEND_CHANGELOG，或網頁右下角版本號）
 * ---------------------------------------------------------------
 * 部署方式（請參考 Cloud_Sync_Setup_Guide.html）：
 *   1. 開啟 https://script.google.com → 新增專案
 *   2. 將本檔案內容貼到 Code.gs（覆蓋原本的 myFunction）
 *   3. 部署 → 新增部署 → 類型「網頁應用程式」
 *      ‣ 執行身分 (Execute as)     : 我
 *      ‣ 存取權 (Who has access)   : 任何人
 *   4. 第一次部署會要求授權「DriveApp」存取
 *   5. 部署完成後，複製「網頁應用程式網址」貼到 homepage.html
 *      的「☁ 雲端設定」對話框
 *
 * 資料檔案：
 *   - KidcastleSalary_Data.json      （員工 + 薪資 主資料）
 *   - KidcastleSalary_ChangeLog.json （變更紀錄）
 *   - KidcastleSalary_Credentials.json（登入帳號 / 密碼）
 *   會自動建立在「執行身分」帳號的 Google Drive 根目錄（我的雲端硬碟）
 *
 * ✉ Email 寄送薪資條（20261008 新增）：
 *   - 寄件人 MAIL_SENDER = wufatw@gmail.com
 *   - 第一次加入後：把 MAIL_KEY 改成自己的寄信密碼 → 執行 testMailPermission 授權 Gmail
 *     → 部署 → 管理部署作業 → 鉛筆 → 版本選「新版本」→ 部署（網址不變）
 *
 * 📅 員工薪資條開放查詢期間（20261009 新增）：
 *   - 預設每月 17 日開放（遇週六、週日、國定假日順延至下一個上班日），開放 7 天，台北時間。
 *   - 老闆可在設定面板（ReadWindowAdmin.html）修改：開放日、天數、是否順延、
 *     強制開放 / 強制關閉、指定月份特別期間、假日清單。設定存在「指令碼屬性」。
 *   - 老闆修改需輸入 ADMIN_KEY（老闆密碼）；第一次加入後請把 ADMIN_KEY 改掉。
 *   - 新增 API：
 *       GET  ?action=read_window                     → 目前是否開放（員工頁面用，不需密碼）
 *       GET  ?action=read&role=employee              → 不在開放期間時回傳錯誤
 *       POST {action:'read_window_get',     adminKey}         → 讀取設定 + 未來 12 個月預覽
 *       POST {action:'read_window_save',    adminKey, settings} → 儲存設定
 *       POST {action:'read_window_preview', adminKey, settings} → 試算（不儲存）
 *       POST {action:'read_window_reset',   adminKey}         → 恢復預設
 *   - 修改後一樣要：部署 → 管理部署作業 → 鉛筆 → 版本選「新版本」→ 部署（網址不變）
 */

// 版本：每次修改在 BACKEND_CHANGELOG 最上面加一筆（格式 VyyyymmddVhhmm），?action=ping 會回傳目前版本
const BACKEND_CHANGELOG = [
  { version: 'V20261009V2100', date: '2026-10-09 21:00',
    changes: ['新增員工薪資條開放查詢期間（每月17日、遇假日順延、開放7天，老闆可設定）', '新增版本號與修改記錄（?action=changelog）'] },
  { version: '20261008V2', date: '2026-10-08',
    changes: ['新增 Email 寄送薪資條 send_payslip'] }
];
const BACKEND_VERSION = BACKEND_CHANGELOG[0].version;

const DATA_FILE  = 'KidcastleSalary_Data.json';
const LOG_FILE   = 'KidcastleSalary_ChangeLog.json';
const CREDS_FILE = 'KidcastleSalary_Credentials.json';

// ✉ 薪資條寄信設定
const MAIL_SENDER    = 'wufatw@gmail.com';        // 寄件人
const MAIL_KEY       = 'wufatw550505';     // ← 必改，網頁第一次寄信時要輸入相同的值
const MAIL_FROM_NAME = 'Kidcastle 薪資系統';

// 📅 薪資條開放查詢設定
const ADMIN_KEY      = '請改成老闆密碼';      // ← 必改，老闆在設定面板輸入相同的值才能修改
const RW_TIMEZONE    = 'Asia/Taipei';
const RW_PROP_KEY    = 'READ_WINDOW_SETTINGS';
const RW_TEST_TODAY  = '';                   // 除錯用：填 'yyyy-MM-dd' 可模擬今天；正式使用保持空字串

// 預設設定（第一次使用、或老闆按「恢復預設」時套用）
const READ_WINDOW_DEFAULTS = {
  openDay: 17,          // 每月開放日（1–28）
  openDays: 7,          // 開放天數（含開放日，1–31）
  postpone: true,       // 遇週末 / 假日順延
  mode: 'auto',         // auto=自動 / open=強制開放 / closed=強制關閉
  overrides: {},        // 特別開放期間 { 'yyyy-MM': { start:'yyyy-MM-dd', end:'yyyy-MM-dd' } }
  holidays: [           // 平日放假的日期（週六日本來就會跳過）；依人事行政總處公告
    '2026-10-09', '2026-10-26', '2026-12-25',
    '2027-01-01', '2027-02-04', '2027-02-05', '2027-02-08', '2027-02-09', '2027-02-10',
    '2027-03-01', '2027-04-05', '2027-04-06', '2027-04-30', '2027-06-09', '2027-09-15',
    '2027-09-28', '2027-10-11', '2027-10-25', '2027-12-24', '2027-12-31'
  ],
  updatedAt: ''
};

// =====================================================================
// Web app entry points
// =====================================================================

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'read';
  try {
    if (action === 'read') {
      // 員工頁面讀取時帶 role=employee，不在開放期間就回傳錯誤
      if (p.role === 'employee') assertReadWindowOpen_();
      return ok({ data: readJson(DATA_FILE) });
    }
    if (action === 'log')         return ok({ log:  readJson(LOG_FILE)  });
    if (action === 'creds')       return ok({ creds: readJson(CREDS_FILE) });
    if (action === 'ping')        return ok({ time: new Date().toISOString(), version: BACKEND_VERSION });
    if (action === 'changelog')   return ok({ version: BACKEND_VERSION, changelog: BACKEND_CHANGELOG });
    if (action === 'read_window') return ok({ window: getReadWindowStatus() });
    return err('未知 action: ' + action);
  } catch (ex) {
    return err(String(ex && ex.message || ex));
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const body = JSON.parse(raw);
    const action = body.action || (e.parameter && e.parameter.action) || 'write';

    if (action === 'write')       return ok({ ts: writeJson(DATA_FILE,  body.data  || {}) });
    if (action === 'write_log')   return ok({ ts: writeJson(LOG_FILE,   body.log   || []) });
    if (action === 'write_creds') return ok({ ts: writeJson(CREDS_FILE, body.creds || {}) });
    if (action === 'append_log')  return ok({ ts: appendLog(body.entry) });
    if (action === 'backup')      return ok(saveBackup(body));
    if (action === 'send_payslip') return ok(sendPayslip(body));

    // 📅 老闆設定（皆需 adminKey）
    if (action === 'read_window_get')     return ok(getReadWindowSettings(body.adminKey));
    if (action === 'read_window_save')    return ok(saveReadWindowSettings(body.settings || {}, body.adminKey));
    if (action === 'read_window_preview') return ok({ preview: previewReadWindowSettings(body.settings || {}, body.adminKey) });
    if (action === 'read_window_reset')   return ok(resetReadWindowSettings(body.adminKey));
    return err('未知 action: ' + action);
  } catch (ex) {
    return err(String(ex && ex.message || ex));
  }
}

// =====================================================================
// Drive helpers (with LockService to serialize concurrent writes)
// =====================================================================

function readJson(name) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const file = getOrCreateFile(name);
    const txt = file.getBlob().getDataAsString();
    if (!txt || !txt.trim()) return name === LOG_FILE ? [] : {};
    return JSON.parse(txt);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function writeJson(name, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const file = getOrCreateFile(name);
    file.setContent(JSON.stringify(payload));
    return new Date().toISOString();
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function appendLog(entry) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const file = getOrCreateFile(LOG_FILE);
    const txt = file.getBlob().getDataAsString();
    const arr = (txt && txt.trim()) ? JSON.parse(txt) : [];
    arr.unshift(entry);
    // Cap log size to last 500 entries
    const trimmed = arr.slice(0, 500);
    file.setContent(JSON.stringify(trimmed));
    return new Date().toISOString();
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function getOrCreateFile(name) {
  const it = DriveApp.getFilesByName(name);
  if (it.hasNext()) return it.next();
  const initial = (name === LOG_FILE) ? '[]' : '{}';
  return DriveApp.createFile(name, initial, 'application/json');
}

// =====================================================================
// Backup file upload — saves xlsx (or any binary) to a backup folder
// Body shape: {
//   action: 'backup',
//   folder: 'Kidcastle_Backups' (optional, default 'Kidcastle_Backups'),
//   filename: 'Salary_11505_2026-05-18.xlsx',
//   mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
//   contentBase64: '<base64-encoded bytes>'
// }
// =====================================================================
function saveBackup(body) {
  const folderName = body.folder || 'Kidcastle_Backups';
  const filename   = body.filename || ('backup_' + new Date().toISOString().replace(/[:.]/g, '-') + '.xlsx');
  const mime       = body.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (!body.contentBase64) throw new Error('缺少 contentBase64 內容');

  const folder = getOrCreateFolder(folderName);
  const bytes = Utilities.base64Decode(body.contentBase64);
  const blob = Utilities.newBlob(bytes, mime, filename);

  // If a file with the same filename exists in this folder, replace its content
  const it = folder.getFilesByName(filename);
  if (it.hasNext()) {
    const f = it.next();
    f.setContent(''); // clear
    f.setTrashed(true); // move old version to trash
  }
  const newFile = folder.createFile(blob);
  return {
    ts: new Date().toISOString(),
    folder: folderName,
    filename: newFile.getName(),
    id: newFile.getId(),
    url: newFile.getUrl()
  };
}

function getOrCreateFolder(name) {
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

// =====================================================================
// ✉ Email 寄送薪資條
// Body shape: {
//   action: 'send_payslip', key: '<寄信密碼>',
//   to: 'teacher@example.com', subject: '...', html: '<!DOCTYPE html>...',
//   attachPdf: true, pdfName: '同安校區_陳明霞_11509_薪資條.pdf'
// }
// 安全機制：1) 需正確的 MAIL_KEY  2) 收件人必須是雲端員工資料裡登記的 Email
// =====================================================================
function sendPayslip(body) {
  if (!MAIL_KEY || MAIL_KEY === '請改成你自己的寄信密碼') {
    throw new Error('Apps Script 尚未設定 MAIL_KEY（寄信密碼）');
  }
  if (String(body.key || '') !== MAIL_KEY) throw new Error('寄信密碼錯誤 (key)');

  const to = String(body.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('收件人 Email 格式錯誤：' + to);

  // 只允許寄給員工資料裡登記的 Email，避免被拿去寄給任意地址
  const data = readJson(DATA_FILE) || {};
  const known = (data.employees || []).some(function (e) {
    return String(e['Email'] || '').trim().toLowerCase() === to.toLowerCase();
  });
  if (!known) throw new Error('收件人不在員工資料中：' + to + '（請先在員工資料 ④ 填寫並儲存）');

  const html = String(body.html || '');
  if (!html) throw new Error('信件內容是空的');
  const subject = String(body.subject || 'Kidcastle 薪資條');

  const options = { htmlBody: html, name: MAIL_FROM_NAME, replyTo: MAIL_SENDER };

  // 若此 Apps Script 不是用 wufatw@gmail.com 部署，改用 Gmail「別名寄件」
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (me && me !== MAIL_SENDER.toLowerCase()) {
    const aliases = GmailApp.getAliases().map(function (a) { return a.toLowerCase(); });
    if (aliases.indexOf(MAIL_SENDER.toLowerCase()) < 0) {
      throw new Error('此 Apps Script 由 ' + me + ' 執行，且未將 ' + MAIL_SENDER + ' 設為寄件別名');
    }
    options.from = MAIL_SENDER;
  }

  if (body.attachPdf) {
    options.attachments = [
      Utilities.newBlob(html, 'text/html', 'payslip.html')
        .getAs('application/pdf')
        .setName(String(body.pdfName || 'payslip.pdf'))
    ];
  }
  const plain = '您的薪資條如下，若無法顯示請使用支援 HTML 的郵件程式開啟' +
                (body.attachPdf ? '，或開啟附件 PDF。' : '。');
  GmailApp.sendEmail(to, subject, plain, options);
  return { to: to, remaining: MailApp.getRemainingDailyQuota() };
}

// 第一次加入後在編輯器手動執行一次：授權 Gmail，並寄一封測試信給寄件人自己
function testMailPermission() {
  GmailApp.sendEmail(MAIL_SENDER, 'Kidcastle 薪資系統 — 寄信測試',
    '收到這封信代表 Apps Script 已可以寄送薪資條。今日剩餘寄信額度：' + MailApp.getRemainingDailyQuota(),
    { name: MAIL_FROM_NAME });
  Logger.log('執行身分：' + Session.getEffectiveUser().getEmail());
}

// =====================================================================
// 📅 員工薪資條開放查詢期間
// =====================================================================

// ---------- 老闆權限 ----------
function rwRequireBoss_(adminKey) {
  if (!ADMIN_KEY || ADMIN_KEY === '請改成老闆密碼') {
    throw new Error('Apps Script 尚未設定 ADMIN_KEY（老闆密碼）');
  }
  if (String(adminKey || '') !== ADMIN_KEY) {
    throw new Error('權限不足：老闆密碼錯誤，無法修改薪資條開放設定。');
  }
}

// ---------- 設定讀寫 ----------
function rwLoadSettings_() {
  const s = JSON.parse(JSON.stringify(READ_WINDOW_DEFAULTS));
  let raw = null;
  try { raw = PropertiesService.getScriptProperties().getProperty(RW_PROP_KEY); } catch (_) {}
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      Object.keys(saved).forEach(function (k) { s[k] = saved[k]; });
    } catch (_) {}
  }
  return s;
}

function getReadWindowSettings(adminKey) {
  rwRequireBoss_(adminKey);
  const s = rwLoadSettings_();
  return { settings: s, preview: rwPreview_(s, 12), window: getReadWindowStatus() };
}

function saveReadWindowSettings(input, adminKey) {
  rwRequireBoss_(adminKey);
  const s = rwLoadSettings_();

  const openDay  = parseInt(input.openDay, 10);
  const openDays = parseInt(input.openDays, 10);
  if (!(openDay >= 1 && openDay <= 28))   throw new Error('每月開放日需介於 1–28。');
  if (!(openDays >= 1 && openDays <= 31)) throw new Error('開放天數需介於 1–31。');
  if (['auto', 'open', 'closed'].indexOf(input.mode) < 0) throw new Error('開放模式不正確。');

  s.openDay   = openDay;
  s.openDays  = openDays;
  s.postpone  = !!input.postpone;
  s.mode      = input.mode;
  s.holidays  = rwNormalizeDates_(input.holidays || []);
  s.overrides = rwValidateOverrides_(input.overrides || {});
  s.updatedAt = Utilities.formatDate(new Date(), RW_TIMEZONE, 'yyyy-MM-dd HH:mm');

  PropertiesService.getScriptProperties().setProperty(RW_PROP_KEY, JSON.stringify(s));

  // 寫入變更紀錄
  try {
    appendLog({
      time: new Date().toISOString(),
      type: 'read_window',
      user: '老闆',
      message: '修改薪資條開放設定：模式=' + s.mode + '，每月' + s.openDay + '日開放' + s.openDays + '天' +
               (s.postpone ? '（遇假日順延）' : '') +
               (Object.keys(s.overrides).length ? '，特別期間：' + Object.keys(s.overrides).join('、') : '')
    });
  } catch (_) {}

  return { settings: s, preview: rwPreview_(s, 12), window: getReadWindowStatus() };
}

function previewReadWindowSettings(input, adminKey) {
  rwRequireBoss_(adminKey);
  const s = rwLoadSettings_();
  s.openDay   = parseInt(input.openDay, 10) || s.openDay;
  s.openDays  = parseInt(input.openDays, 10) || s.openDays;
  s.postpone  = !!input.postpone;
  s.holidays  = rwNormalizeDates_(input.holidays || []);
  s.overrides = rwValidateOverrides_(input.overrides || {});
  return rwPreview_(s, 12);
}

function resetReadWindowSettings(adminKey) {
  rwRequireBoss_(adminKey);
  PropertiesService.getScriptProperties().deleteProperty(RW_PROP_KEY);
  try {
    appendLog({ time: new Date().toISOString(), type: 'read_window', user: '老闆', message: '薪資條開放設定恢復預設' });
  } catch (_) {}
  return getReadWindowSettings(adminKey);
}

function rwValidateOverrides_(src) {
  const out = {};
  Object.keys(src).forEach(function (ym) {
    if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('特別開放期間的月份格式錯誤：' + ym);
    const st = rwNormalizeDates_([src[ym] && src[ym].start])[0];
    const en = rwNormalizeDates_([src[ym] && src[ym].end])[0];
    if (!st || !en) throw new Error(ym + ' 的特別開放期間日期不完整。');
    if (en < st)    throw new Error(ym + ' 的結束日早於開始日。');
    out[ym] = { start: st, end: en };
  });
  return out;
}

// ---------- 日期工具（全部以台北日期字串 yyyy-MM-dd 運算） ----------
const RW_WEEK_ = ['日', '一', '二', '三', '四', '五', '六'];
function rwPad_(n) { return (n < 10 ? '0' : '') + n; }
function rwYmd_(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() + '-' + rwPad_(dt.getUTCMonth() + 1) + '-' + rwPad_(dt.getUTCDate());
}
function rwParts_(s) { const p = s.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
function rwAddDays_(s, n) { const p = rwParts_(s); return rwYmd_(p.y, p.m, p.d + n); }
function rwWeekday_(s) { const p = rwParts_(s); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
function rwLabel_(s) { const p = rwParts_(s); return p.m + '/' + p.d + '（' + RW_WEEK_[rwWeekday_(s)] + '）'; }

function rwNormalizeDates_(list) {
  const out = {};
  (list || []).forEach(function (v) {
    if (!v) return;
    const m = String(v).trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) out[rwYmd_(+m[1], +m[2], +m[3])] = true;
  });
  return Object.keys(out).sort();
}

function rwToday_() {
  if (RW_TEST_TODAY) return RW_TEST_TODAY;
  return Utilities.formatDate(new Date(), RW_TIMEZONE, 'yyyy-MM-dd');
}

// ---------- 開放期間計算 ----------
function rwHolidaySet_(s) {
  const set = {};
  (s.holidays || []).forEach(function (d) { set[d] = true; });
  return set;
}

function rwIsWorkday_(d, set) {
  const w = rwWeekday_(d);
  return w !== 0 && w !== 6 && !set[d];
}

function rwWindowForMonth_(year, month, s, set) {
  const ym = year + '-' + rwPad_(month);
  if (s.overrides && s.overrides[ym]) {
    return { start: s.overrides[ym].start, end: s.overrides[ym].end, special: true };
  }
  let start = rwYmd_(year, month, s.openDay);
  if (s.postpone) {
    let guard = 0;
    while (!rwIsWorkday_(start, set) && guard++ < 31) start = rwAddDays_(start, 1);
  }
  return { start: start, end: rwAddDays_(start, s.openDays - 1), special: false };
}

function rwPreview_(s, months) {
  const set = rwHolidaySet_(s);
  const t = rwParts_(rwToday_());
  const out = [];
  for (let i = 0; i < months; i++) {
    const m = ((t.m - 1 + i) % 12) + 1;
    const y = t.y + Math.floor((t.m - 1 + i) / 12);
    const w = rwWindowForMonth_(y, m, s, set);
    out.push({
      month: y + '年' + m + '月', start: w.start, end: w.end, special: w.special,
      label: rwLabel_(w.start) + ' ～ ' + rwLabel_(w.end)
    });
  }
  return out;
}

/** 目前是否開放（員工頁面用） */
function getReadWindowStatus() {
  const s = rwLoadSettings_();
  if (s.mode === 'open')   return { open: true,  start: '', end: '', message: '薪資條開放查詢中。' };
  if (s.mode === 'closed') return { open: false, start: '', end: '', message: '薪資條查詢暫停中，開放時間將另行通知。' };

  const set = rwHolidaySet_(s);
  const today = rwToday_();
  const t = rwParts_(today);
  const cur = rwWindowForMonth_(t.y, t.m, s, set);
  const prevM = t.m === 1 ? 12 : t.m - 1, prevY = t.m === 1 ? t.y - 1 : t.y;
  const prev = rwWindowForMonth_(prevY, prevM, s, set);   // 上月期間可能跨到本月初

  let active = null;
  if (today >= prev.start && today <= prev.end) active = prev;
  if (today >= cur.start  && today <= cur.end)  active = cur;
  if (active) {
    return {
      open: true, start: active.start, end: active.end,
      message: '薪資條開放查詢中：' + rwLabel_(active.start) + ' ～ ' + rwLabel_(active.end) + ' 23:59'
    };
  }

  let next = cur;
  if (today > cur.end) {
    const nM = t.m === 12 ? 1 : t.m + 1, nY = t.m === 12 ? t.y + 1 : t.y;
    next = rwWindowForMonth_(nY, nM, s, set);
  }
  return {
    open: false, start: next.start, end: next.end,
    message: '目前非薪資條查詢期間。下次開放：' + rwLabel_(next.start) + ' ～ ' + rwLabel_(next.end) + ' 23:59'
  };
}

function assertReadWindowOpen_() {
  const st = getReadWindowStatus();
  if (!st.open) throw new Error(st.message);
  return st;
}

// 在編輯器執行，「執行記錄」會列出未來 12 個月的開放期間
function previewReadWindows() {
  rwPreview_(rwLoadSettings_(), 12).forEach(function (r) {
    Logger.log(r.month + '：' + r.label + (r.special ? '（特別期間）' : ''));
  });
  Logger.log('目前狀態：' + getReadWindowStatus().message);
}

// =====================================================================
// Response helpers
// =====================================================================

function ok(obj) {
  const payload = Object.assign({ ok: true }, obj || {});
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function err(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// Test helper — run "testPing" from Apps Script editor to confirm scopes
// =====================================================================
function testPing() {
  Logger.log('Now: ' + new Date().toISOString());
  Logger.log('Data file: ' + JSON.stringify(readJson(DATA_FILE)).slice(0, 200));
  Logger.log('Log file:  ' + JSON.stringify(readJson(LOG_FILE)).slice(0, 200));
  Logger.log('Read window: ' + JSON.stringify(getReadWindowStatus()));
}
