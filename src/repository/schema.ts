// SQLite 스키마 + 마이그레이션 정의 (P0 #6: 버전 추적·전진형·가산적).
// 첫 스키마라 v1 하나뿐. 스키마 변경 시 v2를 "추가"만 하고 기존 마이그레이션은 절대 수정/삭제 금지.
import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  up: (db: Database) => void;
}

// v1: 초기 스키마 (CLAUDE.md 데이터 모델 — 다품목: 명세서 1장 = 품목 여러 줄).
// 금액은 전부 정수(원). 'transaction'은 SQL 예약어라 테이블명은 transaction_header 사용.
const v1: Migration = {
  version: 1,
  up: (db) => {
    db.exec(`
      CREATE TABLE vendor (
        id                  INTEGER PRIMARY KEY,
        name                TEXT NOT NULL,
        payment_terms_type  TEXT CHECK (payment_terms_type IN ('net', 'dayOfMonth')),
        payment_terms_value INTEGER
      );

      CREATE TABLE category (
        id   INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE transaction_header (
        id             INTEGER PRIMARY KEY,
        vendor_id      INTEGER NOT NULL REFERENCES vendor(id),
        issue_date     TEXT NOT NULL,                       -- 'YYYY-MM-DD'
        due_date       TEXT,                                -- 결제일 계산값
        payment_status TEXT NOT NULL DEFAULT '미지급',       -- 미지급/지급예정/지급완료
        memo           TEXT
      );

      CREATE TABLE transaction_item (
        id             INTEGER PRIMARY KEY,
        transaction_id INTEGER NOT NULL REFERENCES transaction_header(id),
        category_id    INTEGER REFERENCES category(id),     -- nullable = 미분류
        name           TEXT NOT NULL,
        spec           TEXT,
        quantity       REAL,                                -- nullable 보조 (비숫자 수량은 null)
        unit_price     INTEGER,                             -- nullable 보조
        supply_amount  INTEGER NOT NULL,                    -- 공급가액 = 입력의 진실
        tax_type       TEXT NOT NULL CHECK (tax_type IN ('과세', '면세')),
        vat            INTEGER NOT NULL,
        total          INTEGER NOT NULL
      );

      CREATE INDEX idx_txn_vendor      ON transaction_header(vendor_id);
      CREATE INDEX idx_item_txn        ON transaction_item(transaction_id);
      CREATE INDEX idx_item_category   ON transaction_item(category_id);
    `);
  },
};

// v2: 결제일 수동 지정 플래그 + 최근 수정 추적 (가산적, P0 #6).
//   due_date_overridden=1 이면 update 시 dueDate를 재계산하지 않고 입력값을 유지.
//   updated_at = 생성/수정 시각(ISO) — 홈 "최근 건드린 것"용.
const v2: Migration = {
  version: 2,
  up: (db) => {
    db.exec(`
      ALTER TABLE transaction_header ADD COLUMN due_date_overridden INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE transaction_header ADD COLUMN updated_at TEXT;
    `);
  },
};

export const MIGRATIONS: readonly Migration[] = [v1, v2];

// 최신 스키마 버전 = 마이그레이션 중 가장 큰 version
export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
