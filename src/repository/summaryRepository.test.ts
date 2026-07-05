import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import { createVendorRepository } from './vendorRepository';
import { createCategoryRepository } from './categoryRepository';
import { createTransactionRepository } from './transactionRepository';
import { createSummaryRepository, type SummaryRepository } from './summaryRepository';

let db: DB;
let summary: SummaryRepository;
let vendorA: number;
let vendorB: number;

beforeEach(() => {
  db = openDatabase(':memory:');
  const vendors = createVendorRepository(db);
  const cats = createCategoryRepository(db);
  const txns = createTransactionRepository(db);

  const sik = cats.create('식자재').id;
  const po = cats.create('포장재').id;
  vendorA = vendors.create({ name: 'A상사', paymentTerms: null, phone: '010-1111-2222', accountNumber: '111-22' }).id;
  vendorB = vendors.create({ name: 'B상사', paymentTerms: null }).id;

  const item = (over = {}) => ({ categoryId: null, name: '품목', spec: null, quantity: null, unitPrice: null, supplyAmount: 1000, taxType: '과세' as const, ...over });

  // A: 2026-04 두 건(미지급 110000 + 지급완료 50000면세)
  txns.create({ vendorId: vendorA, issueDate: '2026-04-10', paymentStatus: '미지급', memo: null,
    items: [item({ name: '쌀', categoryId: sik, quantity: 10, supplyAmount: 100000, taxType: '과세' })] });
  txns.create({ vendorId: vendorA, issueDate: '2026-04-20', paymentStatus: '지급완료', memo: null,
    items: [item({ name: '봉투', categoryId: po, quantity: 5, supplyAmount: 50000, taxType: '면세' })] });
  // B: 2026-05 한 건(미지급 220000), 같은 품목 '쌀'
  txns.create({ vendorId: vendorB, issueDate: '2026-05-05', paymentStatus: '미지급', memo: null,
    items: [item({ name: '쌀', categoryId: sik, quantity: 20, supplyAmount: 200000, taxType: '과세' })] });

  summary = createSummaryRepository(db);
});

describe('summaryRepository.monthly', () => {
  it('월별 집계 + 지급완료/미지급 분리', () => {
    const m = summary.monthly();
    expect(m.map((r) => r.month)).toEqual(['2026-04', '2026-05']);
    const apr = m[0];
    expect(apr).toMatchObject({ txnCount: 2, vendorCount: 1, supply: 150000, vat: 10000, total: 160000, paid: 50000, unpaid: 110000 });
    const may = m[1];
    expect(may).toMatchObject({ txnCount: 1, vendorCount: 1, supply: 200000, total: 220000, paid: 0, unpaid: 220000 });
  });
});

describe('summaryRepository.byVendor', () => {
  it('거래처별 집계 + 연락처 + 마지막 거래일', () => {
    const v = summary.byVendor();
    const a = v.find((r) => r.vendorId === vendorA)!;
    expect(a).toMatchObject({ txnCount: 2, supply: 150000, total: 160000, unpaid: 110000, lastDate: '2026-04-20', phone: '010-1111-2222', accountNumber: '111-22' });
    const b = v.find((r) => r.vendorId === vendorB)!;
    expect(b).toMatchObject({ txnCount: 1, total: 220000, unpaid: 220000, lastDate: '2026-05-05', phone: null });
  });
});

describe('summaryRepository.byItem', () => {
  it('품목별 합계 + 대표 카테고리 + 주요 거래처 + 평균단가', () => {
    const items = summary.byItem();
    const rice = items.find((r) => r.itemName === '쌀')!;
    // 쌀: A 수량10/공급10만 + B 수량20/공급20만
    expect(rice).toMatchObject({ totalQty: 30, supply: 300000, total: 330000, categoryName: '식자재', mainVendor: 'B상사', avgUnitPrice: 10000 });
    const bag = items.find((r) => r.itemName === '봉투')!;
    expect(bag).toMatchObject({ totalQty: 5, supply: 50000, vat: 0 });
  });
});

describe('summaryRepository.vendorItems', () => {
  it('거래처별 품목(합계금액 큰 순)', () => {
    const items = summary.vendorItems(vendorA);
    expect(items.map((i) => i.itemName)).toEqual(['쌀', '봉투']); // 110000 > 50000
    expect(items[0]).toMatchObject({ itemName: '쌀', totalQty: 10, supply: 100000, total: 110000, lineCount: 1 });
  });
});

describe('summaryRepository.itemTransactions', () => {
  it('품목별 개별 거래(언제·어디서), 거래일 순', () => {
    const tx = summary.itemTransactions('쌀'); // A 2026-04-10, B 2026-05-05
    expect(tx.map((t) => [t.issueDate, t.vendorName])).toEqual([
      ['2026-04-10', 'A상사'],
      ['2026-05-05', 'B상사'],
    ]);
    expect(tx[0]).toMatchObject({ quantity: 10, supply: 100000, total: 110000, paymentStatus: '미지급' });
  });
});

describe('summaryRepository.outstandingByVendor (전월 미수금)', () => {
  it('선택 월의 미지급만 거래처별로 — 지급완료 제외', () => {
    // 2026-04: A 미지급 쌀(11만) + 지급완료 봉투(제외) → A만, 미수금 11만
    const apr = summary.outstandingByVendor('2026-04');
    expect(apr).toHaveLength(1);
    expect(apr[0]).toMatchObject({
      vendorId: vendorA, vendorName: 'A상사', txnCount: 1,
      supply: 100000, vat: 10000, unpaid: 110000, phone: '010-1111-2222', accountNumber: '111-22',
    });
    // 2026-05: B 미지급 쌀(22만)
    const may = summary.outstandingByVendor('2026-05');
    expect(may).toHaveLength(1);
    expect(may[0]).toMatchObject({ vendorId: vendorB, unpaid: 220000 });
  });
  it('미수금 없는 달은 빈 배열', () => {
    expect(summary.outstandingByVendor('2026-06')).toEqual([]);
  });
});

describe('summaryRepository.outstandingVendorItems (드릴다운)', () => {
  it('선택 월·거래처의 미지급 품목만', () => {
    // A 2026-04: 미지급 쌀만(봉투는 지급완료라 제외)
    const items = summary.outstandingVendorItems(vendorA, '2026-04');
    expect(items.map((i) => i.itemName)).toEqual(['쌀']);
    expect(items[0]).toMatchObject({ itemName: '쌀', totalQty: 10, supply: 100000, total: 110000, lineCount: 1 });
  });
});
