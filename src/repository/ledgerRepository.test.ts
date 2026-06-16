import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import { createVendorRepository } from './vendorRepository';
import { createCategoryRepository } from './categoryRepository';
import { createTransactionRepository, type TransactionItemInput } from './transactionRepository';
import { createLedgerRepository, type LedgerRepository } from './ledgerRepository';

let db: DB;
let ledger: LedgerRepository;

function item(over: Partial<TransactionItemInput> = {}): TransactionItemInput {
  return {
    categoryId: null,
    name: '품목',
    spec: null,
    quantity: null,
    unitPrice: null,
    supplyAmount: 10000,
    taxType: '과세',
    ...over,
  };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  ledger = createLedgerRepository(db);
});

// --- Blackbox: 평면 행 조인·필터·검색 ---
describe('ledgerRepository — blackbox', () => {
  it('품목 줄을 헤더·거래처·카테고리와 조인한 평면 행을 낸다', () => {
    const vendors = createVendorRepository(db);
    const categories = createCategoryRepository(db);
    const txns = createTransactionRepository(db);
    const v = vendors.create({ name: '가나상회', paymentTerms: { type: 'net', value: 30 } });
    const cat = categories.create('식자재');
    txns.create({
      vendorId: v.id,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: '비고1',
      items: [item({ name: 'A', categoryId: cat.id }), item({ name: 'B' })],
    });
    const rows = ledger.list();
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.itemName === 'A')!;
    expect(a.vendorName).toBe('가나상회');
    expect(a.categoryName).toBe('식자재');
    expect(a.dueDate).toBe('2026-07-16');
    const b = rows.find((r) => r.itemName === 'B')!;
    expect(b.categoryId).toBeNull();
    expect(b.categoryName).toBeNull(); // LEFT JOIN: 미분류
  });

  it('거래처·결제상태·월 필터', () => {
    const vendors = createVendorRepository(db);
    const txns = createTransactionRepository(db);
    const v1 = vendors.create({ name: 'v1', paymentTerms: null });
    const v2 = vendors.create({ name: 'v2', paymentTerms: null });
    txns.create({ vendorId: v1.id, issueDate: '2026-06-10', paymentStatus: '미지급', memo: null, items: [item()] });
    txns.create({ vendorId: v2.id, issueDate: '2026-05-10', paymentStatus: '지급완료', memo: null, items: [item()] });

    expect(ledger.list({ filter: { vendorId: v1.id } })).toHaveLength(1);
    expect(ledger.list({ filter: { paymentStatus: '지급완료' } })[0].vendorName).toBe('v2');
    expect(ledger.list({ filter: { month: '2026-05' } })).toHaveLength(1);
  });

  it('검색: 품목명·거래처명·비고 부분일치', () => {
    const vendors = createVendorRepository(db);
    const txns = createTransactionRepository(db);
    const v = vendors.create({ name: '동해상사', paymentTerms: null });
    txns.create({ vendorId: v.id, issueDate: '2026-06-01', paymentStatus: '미지급', memo: '긴급', items: [item({ name: '간장' })] });
    txns.create({ vendorId: v.id, issueDate: '2026-06-02', paymentStatus: '미지급', memo: null, items: [item({ name: '설탕' })] });

    expect(ledger.list({ search: '간장' })).toHaveLength(1);
    expect(ledger.list({ search: '동해' })).toHaveLength(2); // 거래처명
    expect(ledger.list({ search: '긴급' })).toHaveLength(1); // 비고
    expect(ledger.list({ search: '  간장  ' })).toHaveLength(1); // 검색어 trim
    expect(ledger.list({ search: '없는단어' })).toHaveLength(0);
  });
});

// --- Whitebox: 정렬 정확성 (P0 #4) ---
describe('ledgerRepository — whitebox 정렬', () => {
  function seedAmounts(amounts: number[]): void {
    const v = createVendorRepository(db).create({ name: 'v', paymentTerms: null });
    const txns = createTransactionRepository(db);
    for (const a of amounts) {
      txns.create({
        vendorId: v.id,
        issueDate: '2026-06-01',
        paymentStatus: '미지급',
        memo: null,
        items: [item({ supplyAmount: a, taxType: '면세' })], // 면세라 total=supplyAmount
      });
    }
  }

  it('금액은 숫자 정렬 (사전식 아님: 9 < 20 < 100)', () => {
    seedAmounts([100, 9, 20]);
    const asc = ledger.list({ sort: { column: 'supplyAmount', direction: 'asc' } });
    expect(asc.map((r) => r.supplyAmount)).toEqual([9, 20, 100]);
    const desc = ledger.list({ sort: { column: 'total', direction: 'desc' } });
    expect(desc.map((r) => r.total)).toEqual([100, 20, 9]);
  });

  it('날짜는 연대순 정렬 (월·연 경계)', () => {
    const v = createVendorRepository(db).create({ name: 'v', paymentTerms: null });
    const txns = createTransactionRepository(db);
    for (const d of ['2026-01-05', '2025-12-31', '2026-02-01']) {
      txns.create({ vendorId: v.id, issueDate: d, paymentStatus: '미지급', memo: null, items: [item()] });
    }
    const asc = ledger.list({ sort: { column: 'issueDate', direction: 'asc' } });
    expect(asc.map((r) => r.issueDate)).toEqual(['2025-12-31', '2026-01-05', '2026-02-01']);
  });

  it('결제일 기간 필터', () => {
    const v = createVendorRepository(db).create({ name: 'v', paymentTerms: { type: 'net', value: 0 } });
    const txns = createTransactionRepository(db);
    for (const d of ['2026-06-01', '2026-06-15', '2026-07-01']) {
      txns.create({ vendorId: v.id, issueDate: d, paymentStatus: '미지급', memo: null, items: [item()] });
    }
    const rows = ledger.list({ filter: { dueDateFrom: '2026-06-10', dueDateTo: '2026-06-30' } });
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-06-15']);
  });

  it('정렬 컬럼 화이트리스트 — 미허용 컬럼은 throw (주입 차단)', () => {
    expect(() =>
      ledger.list({ sort: { column: 'memo; DROP TABLE vendor' as never, direction: 'asc' } }),
    ).toThrow(/Invalid sort column/);
    // 테이블이 멀쩡한지 확인
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name='vendor'`).get()).toBeTruthy();
  });
});
