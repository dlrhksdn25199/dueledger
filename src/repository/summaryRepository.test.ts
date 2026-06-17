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
