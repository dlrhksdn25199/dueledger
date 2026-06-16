import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import { createVendorRepository } from './vendorRepository';
import {
  createTransactionRepository,
  type TransactionRepository,
  type TransactionItemInput,
} from './transactionRepository';

let db: DB;
let repo: TransactionRepository;
let vendorWithTerms: number;
let vendorNoTerms: number;

beforeEach(() => {
  db = openDatabase(':memory:');
  const vendors = createVendorRepository(db);
  vendorWithTerms = vendors.create({ name: '가나상회', paymentTerms: { type: 'net', value: 30 } }).id;
  vendorNoTerms = vendors.create({ name: '결제조건없음', paymentTerms: null }).id;
  repo = createTransactionRepository(db);
});

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

// --- Blackbox: 명세서 CRUD ---
describe('transactionRepository — blackbox CRUD', () => {
  it('create → getById 로 헤더+품목 되읽기', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: '비고',
      items: [item({ name: 'A' }), item({ name: 'B', supplyAmount: 5000 })],
    });
    const read = repo.getById(t.id)!;
    expect(read.items).toHaveLength(2);
    expect(read.items.map((i) => i.name)).toEqual(['A', 'B']);
    expect(read.memo).toBe('비고');
  });

  it('update 가 헤더와 품목을 교체한다', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item({ name: 'A' }), item({ name: 'B' })],
    });
    repo.update(t.id, {
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '지급완료',
      memo: null,
      items: [item({ name: 'C' })], // 2줄 → 1줄로 교체
    });
    const read = repo.getById(t.id)!;
    expect(read.paymentStatus).toBe('지급완료');
    expect(read.items.map((i) => i.name)).toEqual(['C']);
  });

  it('remove 가 헤더+품목을 함께 지운다', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item(), item()],
    });
    repo.remove(t.id);
    expect(repo.getById(t.id)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) c FROM transaction_item').get()).toEqual({ c: 0 });
  });
});

// --- Whitebox: 파생값(vat·total·dueDate) 쓰기 시점 계산 (P0 #1) ---
describe('transactionRepository — whitebox 파생값', () => {
  it('vat·total 을 domain 공식으로 저장 (과세=round×0.1)', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item({ supplyAmount: 12345, taxType: '과세' })],
    });
    const i = repo.getById(t.id)!.items[0];
    expect(i.vat).toBe(1235); // 12,345 × 0.1 = 1234.5 → 올림 1235
    expect(i.total).toBe(13580);
  });

  it('면세 품목 vat=0, total=supplyAmount', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item({ supplyAmount: 7000, taxType: '면세' })],
    });
    const i = repo.getById(t.id)!.items[0];
    expect(i.vat).toBe(0);
    expect(i.total).toBe(7000);
  });

  it('dueDate = 거래처 결제조건(net-30) 적용', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    expect(repo.getById(t.id)!.dueDate).toBe('2026-07-16');
  });

  it('결제조건 없는 거래처 → dueDate = null', () => {
    const t = repo.create({
      vendorId: vendorNoTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    expect(repo.getById(t.id)!.dueDate).toBeNull();
  });

  it('update 시 dueDate 재계산 (발행일 변경 반영)', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    repo.update(t.id, {
      vendorId: vendorWithTerms,
      issueDate: '2026-01-01',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    expect(repo.getById(t.id)!.dueDate).toBe('2026-01-31');
  });

  it('수량·단가 nullable 보조 — null 그대로 저장, supplyAmount 가 진실', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item({ quantity: null, unitPrice: null, supplyAmount: 33000 })],
    });
    const i = repo.getById(t.id)!.items[0];
    expect(i.quantity).toBeNull();
    expect(i.unitPrice).toBeNull();
    expect(i.supplyAmount).toBe(33000);
  });
});
