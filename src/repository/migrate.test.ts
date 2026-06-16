import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from './db';
import { migrate, backupDatabaseFile } from './migrate';
import { LATEST_VERSION, MIGRATIONS } from './schema';

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

  it('v1 DB → 최신으로 업그레이드: 데이터 보존 + 백업 생성 (P0 #6 첫 실전)', () => {
    const path = tmpPath();
    // v1 상태의 DB를 수동 구성 (초기 마이그레이션만 적용)
    const raw = new Database(path);
    MIGRATIONS[0].up(raw);
    raw.pragma('user_version = 1');
    raw.prepare(`INSERT INTO vendor (name) VALUES ('보존회사')`).run();
    raw.close();

    // openDatabase가 v2까지 전진 마이그레이션
    const db = openDatabase(path);
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);
    // v2 추가 컬럼 존재
    const cols = (db.prepare(`PRAGMA table_info(transaction_header)`).all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['due_date_overridden', 'updated_at']));
    // 기존 데이터 보존
    expect(db.prepare(`SELECT name FROM vendor`).get()).toEqual({ name: '보존회사' });
    db.close();

    // 데이터 있는 DB(version>0)를 올렸으니 백업이 1개 생성됨 (P0 #6b)
    const base = path.split('/').pop();
    const backups = readdirSync(tmpdir()).filter((n) => n.startsWith(`${base}.backup`));
    expect(backups).toHaveLength(1);
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
