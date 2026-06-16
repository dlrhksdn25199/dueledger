// DB 오픈 단일 진입점 — 여기서만 better-sqlite3를 생성한다 (P0 #5 repository 경계).
// UI·domain·parser는 이 모듈/repository 함수만 거치고 SQLite를 직접 열지 않는다.
import Database from 'better-sqlite3';
import { migrate } from './migrate';

export type DB = Database.Database;

// filePath: 실파일 경로 또는 ':memory:'(테스트). 오픈 즉시 최신 스키마로 마이그레이션.
export function openDatabase(filePath: string): DB {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db, filePath);
  return db;
}
