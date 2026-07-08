import { describe, it, expect, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDatabase, type DB } from './db';
import { createImportRepository, type ImportRepository } from './importRepository';
import { createTransactionRepository } from './transactionRepository';
import { createLedgerRepository } from './ledgerRepository';
import { setTaxRate } from './settingsRepository';
import { parseLedgerWorkbook, type ParseResult } from '../parser/excelImport';

// 합성 fixture(실명·실금액 아님) — test/fixtures/build-sample.mjs 참고.
const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(here, '..', '..', 'test', 'fixtures', 'sample-ledger.xlsx');

let db: DB;
let repo: ImportRepository;
let parsed: ParseResult;

beforeEach(() => {
  db = openDatabase(':memory:'); // 빈 DB (시드 없음) — 모든 거래처/카테고리가 신규
  repo = createImportRepository(db);
  parsed = parseLedgerWorkbook(SAMPLE);
});

describe('importRepository — preview', () => {
  it('미리보기는 쓰기 없이 신규/중복을 집계', () => {
    const s = repo.preview(parsed);
    expect(s.newStatements).toBe(3);
    expect(s.newItems).toBe(6);
    expect(s.duplicateItems).toBe(0);
    expect(s.newCategories).toContain('원재료');
    // preview는 DB를 건드리지 않음
    expect((db.prepare(`SELECT COUNT(*) AS c FROM transaction_header`).get() as { c: number }).c).toBe(0);
  });
});

describe('importRepository — commit', () => {
  it('명세서·품목·신규 거래처/카테고리를 적재', () => {
    const s = repo.commit(parsed);
    expect(s.newItems).toBe(6);
    const headers = (db.prepare(`SELECT COUNT(*) AS c FROM transaction_header`).get() as { c: number }).c;
    const items = (db.prepare(`SELECT COUNT(*) AS c FROM transaction_item`).get() as { c: number }).c;
    expect(headers).toBe(s.newStatements);
    expect(items).toBe(6);
    // 거래처(3) 자동 생성
    expect((db.prepare(`SELECT COUNT(*) AS c FROM vendor`).get() as { c: number }).c).toBe(s.newVendors.length);
    expect(s.newVendors).toHaveLength(3);
    expect(s.newCategories.length).toBeGreaterThan(0);
  });

  it('결제일 = 거래일자, 수동지정 플래그 ON', () => {
    repo.commit(parsed);
    const rows = db
      .prepare(`SELECT issue_date, due_date, due_date_overridden FROM transaction_header`)
      .all() as { issue_date: string; due_date: string; due_date_overridden: number }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.due_date).toBe(r.issue_date);
      expect(r.due_date_overridden).toBe(1);
    }
  });

  it('파생값(vat·total)은 domain 공식으로 저장 — 면세=0', () => {
    repo.commit(parsed);
    const bad = db
      .prepare(
        `SELECT COUNT(*) AS c FROM transaction_item
          WHERE (tax_type = '면세' AND vat <> 0)
             OR (tax_type = '과세' AND vat <> CAST(ROUND(supply_amount * 0.1) AS INTEGER))
             OR total <> supply_amount + vat`,
      )
      .get() as { c: number };
    expect(bad.c).toBe(0);
    // 면세 품목이 실제로 vat 0으로 저장됐는지 확인
    const myeonse = db.prepare(`SELECT vat FROM transaction_item WHERE tax_type = '면세'`).all() as { vat: number }[];
    expect(myeonse.length).toBeGreaterThan(0);
    expect(myeonse.every((r) => r.vat === 0)).toBe(true);
  });

  it('설정된 세율로 과세 vat 계산 (0.1 → 0.2)', () => {
    setTaxRate(db, 0.2);
    repo.commit(parsed);
    const bad = db
      .prepare(
        `SELECT COUNT(*) AS c FROM transaction_item
          WHERE tax_type = '과세' AND vat <> CAST(ROUND(supply_amount * 0.2) AS INTEGER)`,
      )
      .get() as { c: number };
    expect(bad.c).toBe(0);
  });

  it('재임포트(같은 파일)는 전부 중복으로 건너뜀', () => {
    repo.commit(parsed);
    const again = repo.commit(parsed);
    expect(again.newStatements).toBe(0);
    expect(again.newItems).toBe(0);
    expect(again.duplicateItems).toBe(6);
    // 데이터가 2배가 되지 않음
    expect((db.prepare(`SELECT COUNT(*) AS c FROM transaction_item`).get() as { c: number }).c).toBe(6);
  });

  it('적재된 명세서가 원장(ledger) 조회로 보인다', () => {
    repo.commit(parsed);
    const ledger = createLedgerRepository(db);
    expect(ledger.list().length).toBe(6);
    const tx = createTransactionRepository(db);
    expect(tx.listSummaries().length).toBe(3);
  });
});
