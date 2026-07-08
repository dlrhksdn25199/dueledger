import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import { createVendorRepository } from './vendorRepository';
import { setTaxRate } from './settingsRepository';
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

describe('transactionRepository — 결제일 수동 지정', () => {
  it('수동 지정이면 자동계산 대신 입력값 저장', () => {
    const t = repo.create({
      vendorId: vendorWithTerms, // net-30이면 자동 2026-07-16이지만 수동 우선
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
      dueDateOverridden: true,
      dueDate: '2026-12-25',
    });
    const read = repo.getById(t.id)!;
    expect(read.dueDate).toBe('2026-12-25');
    expect(read.dueDateOverridden).toBe(true);
  });

  it('기본(미지정)은 자동계산 + overridden=false', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    const read = repo.getById(t.id)!;
    expect(read.dueDate).toBe('2026-07-16');
    expect(read.dueDateOverridden).toBe(false);
  });

  it('update로 수동→자동 전환 시 재계산', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
      dueDateOverridden: true,
      dueDate: '2099-01-01',
    });
    repo.update(t.id, {
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
      // dueDateOverridden 생략 → 자동
    });
    const read = repo.getById(t.id)!;
    expect(read.dueDate).toBe('2026-07-16');
    expect(read.dueDateOverridden).toBe(false);
  });
});

describe('transactionRepository.setPaymentStatus', () => {
  it('결제상태만 바꾸고 품목·결제일은 유지', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item({ supplyAmount: 10000 }), item({ supplyAmount: 5000 })],
    });
    repo.setPaymentStatus(t.id, '지급완료');
    const after = repo.getById(t.id)!;
    expect(after.paymentStatus).toBe('지급완료');
    expect(after.dueDate).toBe(t.dueDate); // 결제일 불변
    expect(after.items).toHaveLength(2); // 품목 불변
  });

  it('없는 id면 throw', () => {
    expect(() => repo.setPaymentStatus(9999, '지급완료')).toThrow();
  });
});

describe('transactionRepository.setIssueDate / setDueDate', () => {
  it('미수동지정: 발행일 변경 시 결제일을 거래처 조건으로 재계산', () => {
    const t = repo.create({
      vendorId: vendorWithTerms, // net-30
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    expect(t.dueDate).toBe('2026-07-16');
    repo.setIssueDate(t.id, '2026-06-20');
    const after = repo.getById(t.id)!;
    expect(after.issueDate).toBe('2026-06-20');
    expect(after.dueDate).toBe('2026-07-20'); // 재계산됨
  });

  it('수동지정 상태면 발행일만 바뀌고 결제일은 유지', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
      dueDateOverridden: true,
      dueDate: '2026-08-01',
    });
    repo.setIssueDate(t.id, '2026-06-20');
    const after = repo.getById(t.id)!;
    expect(after.issueDate).toBe('2026-06-20');
    expect(after.dueDate).toBe('2026-08-01'); // 유지
  });

  it('setDueDate는 결제일을 직접 지정하고 수동 플래그를 켠다', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    repo.setDueDate(t.id, '2026-09-09');
    const after = repo.getById(t.id)!;
    expect(after.dueDate).toBe('2026-09-09');
    expect(after.dueDateOverridden).toBe(true);
    // 이후 발행일을 바꿔도 결제일 유지
    repo.setIssueDate(t.id, '2026-06-01');
    expect(repo.getById(t.id)!.dueDate).toBe('2026-09-09');
  });
});

describe('transactionRepository.listRecent', () => {
  it('최근 생성 순(newest first) + limit', () => {
    const mk = (memo: string) =>
      repo.create({ vendorId: vendorWithTerms, issueDate: '2026-06-16', paymentStatus: '미지급', memo, items: [item()] });
    mk('A');
    mk('B');
    const c = mk('C');
    const recent = repo.listRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe(c.id); // 가장 최근
  });
});

describe('transactionRepository — 편집 가능 세율(taxRate) 적용', () => {
  it('저장 시점 세율로 vat 계산 (0.1 → 0.13)', () => {
    setTaxRate(db, 0.13);
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item({ supplyAmount: 10000, taxType: '과세' })],
    });
    const i = repo.getById(t.id)!.items[0];
    expect(i.vat).toBe(1300); // 10,000 × 0.13
    expect(i.total).toBe(11300);
  });

  it('세율 변경은 기존 명세서 vat를 바꾸지 않음 (쓰기 시점 값 유지)', () => {
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item({ supplyAmount: 10000, taxType: '과세' })],
    });
    expect(repo.getById(t.id)!.items[0].vat).toBe(1000); // 기본 0.1
    setTaxRate(db, 0.2);
    // 다시 읽어도 그대로(재계산 안 함)
    expect(repo.getById(t.id)!.items[0].vat).toBe(1000);
  });
});

describe('transactionRepository.recomputeDueDatesForVendor', () => {
  it('결제조건 변경 후 재계산: 수동지정 아닌 명세서만 dueDate 갱신', () => {
    const vendors = createVendorRepository(db);
    const auto = repo.create({
      vendorId: vendorWithTerms, // net-30 → 2026-07-16
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    const manual = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
      dueDateOverridden: true,
      dueDate: '2099-01-01',
    });
    // 결제조건을 매월 10일로 변경
    vendors.update(vendorWithTerms, { name: '가나상회', paymentTerms: { type: 'dayOfMonth', value: 10 } });
    const count = repo.recomputeDueDatesForVendor(vendorWithTerms);
    expect(count).toBe(1); // 자동 1건만
    expect(repo.getById(auto.id)!.dueDate).toBe('2026-07-10'); // 6/16은 10일 지남 → 다음 달 10일
    expect(repo.getById(manual.id)!.dueDate).toBe('2099-01-01'); // 수동은 유지
  });

  it('결제조건 제거 시 자동 명세서 dueDate → null', () => {
    const vendors = createVendorRepository(db);
    const t = repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16',
      paymentStatus: '미지급',
      memo: null,
      items: [item()],
    });
    expect(repo.getById(t.id)!.dueDate).toBe('2026-07-16');
    vendors.update(vendorWithTerms, { name: '가나상회', paymentTerms: null });
    repo.recomputeDueDatesForVendor(vendorWithTerms);
    expect(repo.getById(t.id)!.dueDate).toBeNull();
  });
});

describe('transactionRepository.listSummaries', () => {
  it('명세서 단위 합계·결제일 정렬(미정은 뒤)', () => {
    // net-30 거래처: 발행일+30일이 결제일
    repo.create({
      vendorId: vendorWithTerms,
      issueDate: '2026-06-16', // due 2026-07-16
      paymentStatus: '미지급',
      memo: null,
      items: [item({ supplyAmount: 10000, taxType: '면세' }), item({ supplyAmount: 5000, taxType: '면세' })],
    });
    repo.create({
      vendorId: vendorNoTerms, // dueDate null
      issueDate: '2026-06-01',
      paymentStatus: '지급완료',
      memo: null,
      items: [item({ supplyAmount: 7000, taxType: '면세' })],
    });
    const sums = repo.listSummaries();
    expect(sums).toHaveLength(2);
    // 결제일 있는 것 먼저
    expect(sums[0].dueDate).toBe('2026-07-16');
    expect(sums[0].total).toBe(15000); // 두 품목 합계
    expect(sums[0].itemCount).toBe(2);
    expect(sums[0].vendorName).toBe('가나상회');
    // 미정(null)은 뒤
    expect(sums[1].dueDate).toBeNull();
    expect(sums[1].paymentStatus).toBe('지급완료');
  });
});
