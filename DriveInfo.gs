/**
 * Kidcastle 薪資系統 — ☁ 雲端硬碟名稱／檔名查詢（V20261025V0930）
 * ---------------------------------------------------------------
 * 讓網頁在「複製、刪除、備份」時，顯示資料實際存在哪個 Google 雲端硬碟（帳號）、
 * 哪個資料夾、哪個檔名。
 *
 * 本檔不含任何密碼，會使用 Code.gs 裡已有的：DATA_FILE、ok
 *
 * 安裝方式：
 *   1. Apps Script 專案 → 左側「檔案」旁的 ＋ → 指令碼 → 命名為 DriveInfo → 貼上本檔全部內容
 *   2. Code.gs 的 doGet() 裡，在 `const action = ...` 下一行加入：
 *        if (action === 'drive_info') return ok(driveInfo_());
 *   3. 部署 → 管理部署作業 → 鉛筆 → 版本選「新版本」→ 部署（網址不變）
 *
 * 沒有安裝也不會壞：網頁會改用預設值（castlepartywu@gmail.com 的我的雲端硬碟）。
 */

const DRIVE_INFO_BACKUP_FOLDERS = ['Kidcastle_Backups', 'Kidcastle_Backups_Old'];

function driveInfo_() {
  const account = String(Session.getEffectiveUser().getEmail() || '');
  const info = {
    account: account,                 // 雲端硬碟擁有者帳號
    driveName: '我的雲端硬碟',          // 雲端硬碟名稱
    dataFile: DATA_FILE,              // 主資料檔名
    dataFolder: '',                   // 主資料檔所在資料夾
    dataFileUrl: '',
    dataUpdated: '',
    backupFolders: {}
  };
  const it = DriveApp.getFilesByName(DATA_FILE);
  if (it.hasNext()) {
    const f = it.next();
    info.dataFileUrl = f.getUrl();
    info.dataUpdated = f.getLastUpdated().toISOString();
    info.dataFolder = driveInfoPath_(f.getParents());
  }
  DRIVE_INFO_BACKUP_FOLDERS.forEach(function (name) {
    const fi = DriveApp.getFoldersByName(name);
    if (fi.hasNext()) {
      const fo = fi.next();
      info.backupFolders[name] = { path: driveInfoPath_(fo.getParents()) + '/' + name, url: fo.getUrl() };
    }
  });
  return info;
}

// 由下往上組出資料夾路徑，例如「我的雲端硬碟/Kidcastle」
function driveInfoPath_(parents) {
  const names = [];
  let guard = 0;
  while (parents.hasNext() && guard++ < 20) {
    const p = parents.next();
    const root = DriveApp.getRootFolder().getId();
    if (p.getId() === root) { names.unshift('我的雲端硬碟'); break; }
    names.unshift(p.getName());
    parents = p.getParents();
  }
  return names.join('/') || '我的雲端硬碟';
}
