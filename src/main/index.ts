// Electron 메인 — 앱 수명주기 + DB 소유 + IPC 등록. DB는 여기서만 열린다.
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { openDatabase, type DB } from '../repository/db';
import { seedCategories } from '../repository/seed';
import { registerIpcHandlers } from './ipc';

let db: DB | null = null;

// CDP UI 테스트 훅 — 환경변수가 있을 때만 렌더러 원격 디버깅 포트를 연다(평소엔 비활성).
if (process.env.DUELEDGER_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  // 개발 = electron-vite dev 서버 URL, 프로덕션 = 번들된 index.html
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // 🗄️ 데이터 경로 = userData(%APPDATA%) 고정 — .exe 옆 금지 (CLAUDE.md P0).
  const dbPath = join(app.getPath('userData'), 'dueledger.db');
  db = openDatabase(dbPath);
  seedCategories(db); // 첫 실행 시에만 기본 카테고리 투입(멱등)
  registerIpcHandlers(db);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  db?.close();
  db = null;
});
