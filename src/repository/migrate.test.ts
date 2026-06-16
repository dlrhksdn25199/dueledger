import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db';
import { migrate, backupDatabaseFile } from './migrate';
import { LATEST_VERSION } from './schema';

const tmpFiles: string[] = [];
function tmpPath(): string {
  const p = join(tmpdir(), `dueledger-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  tmpFiles.push(p);
  return p;
}
afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    for (const ext of ['', '-wal', '-shm']) rmSync(f + ext, { force: true });
    // 백업 파일도 정리
    for (const b of readdirSync(tmpdir()).filter((n) => n.startsWith(`${f.split('/').pop()}.backup`))) {
      rmSync(join(tmpdir(), b), { force: true });
    }
  }
});

// --- Blackbox: 오픈 후 스키마가 쓸 수 있는 상태 ---
describe('openDatabase / migrate — blackbox', () => {
  it('4개 테이블이 생성된다', () => {
    const db = openDatabase(':memory:');
    const names = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['vendor', 'category', 'transaction_header', 'transaction_item']),
    );
    db.close();
  });
});

// --- Whitebox: 버전 추적·멱등·백업 메커니즘 (P0 #6) ---
describe('migrate — whitebox', () => {
  it('마이그레이션 후 user_version = LATEST_VERSION', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);
    db.close();
  });

  it('foreign_keys 가 켜져 있다', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('멱등 — 다시 migrate 해도 에러·중복 없음', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);
    db.close();
  });

  it('새 파일(version 0) 초기 마이그레이션은 백업을 만들지 않는다', () => {
    const path = tmpPath();
    const db = openDatabase(path);
    db.close();
    const backups = readdirSync(tmpdir()).filter((n) =>
      n.startsWith(`${path.split('/').pop()}.backup`),
    );
    expect(backups).toHaveLength(0);
  });

  it('backupDatabaseFile: 기존 파일을 동일 내용으로 복사한다 (P0 #6b)', () => {
    const path = tmpPath();
    writeFileSync(path, 'OLD-DB-BYTES');
    const backup = backupDatabaseFile(path);
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup, 'utf8')).toBe('OLD-DB-BYTES');
    rmSync(backup, { force: true });
  });
});
