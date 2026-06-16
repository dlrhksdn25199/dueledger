// 마이그레이션 실행기 (P0 #6). 제네릭 엔진 아님 — 버전 비교 + 트랜잭션 + 사전 백업, 최소만.
import { copyFileSync, existsSync } from 'node:fs';
import type { Database } from 'better-sqlite3';
import { MIGRATIONS } from './schema';

// 기존 DB 파일을 타임스탬프 백업으로 복사 (P0 #6b: 로컬 앱의 유일한 안전망).
// 반환 = 백업 경로.
export function backupDatabaseFile(filePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${stamp}`;
  copyFileSync(filePath, backupPath);
  return backupPath;
}

// 시작 시 user_version을 읽어 미적용 마이그레이션을 전진 적용.
// filePath가 실제 파일이고 기존 데이터가 있으면(version > 0) 적용 전 백업.
export function migrate(db: Database, filePath?: string): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  if (pending.length === 0) return;

  // 새 빈 DB(version 0)는 백업할 데이터가 없음 → 기존 DB를 올릴 때만 백업.
  if (current > 0 && filePath && filePath !== ':memory:' && existsSync(filePath)) {
    backupDatabaseFile(filePath);
  }

  for (const m of pending) {
    // P0 #6c: 마이그레이션 + 버전 기록을 한 트랜잭션으로 — 중간에 죽으면 롤백, 옛 DB 보존.
    const apply = db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    });
    apply();
  }
}
