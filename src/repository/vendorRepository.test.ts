import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import { createVendorRepository, type VendorRepository } from './vendorRepository';

let db: DB;
let repo: VendorRepository;
beforeEach(() => {
  db = openDatabase(':memory:');
  repo = createVendorRepository(db);
});

// --- Blackbox: CRUD 공개 동작 ---
describe('vendorRepository — blackbox CRUD', () => {
  it('create → getById 로 되읽기', () => {
    const v = repo.create({ name: '가나상회', paymentTerms: { type: 'net', value: 30 } });
    expect(v.id).toBeGreaterThan(0);
    expect(repo.getById(v.id)).toEqual(v);
  });

  it('getAll 은 이름 순', () => {
    repo.create({ name: '다', paymentTerms: null });
    repo.create({ name: '가', paymentTerms: null });
    expect(repo.getAll().map((v) => v.name)).toEqual(['가', '다']);
  });

  it('update 가 값을 바꾼다', () => {
    const v = repo.create({ name: '가', paymentTerms: { type: 'net', value: 10 } });
    const updated = repo.update(v.id, {
      name: '가나',
      paymentTerms: { type: 'dayOfMonth', value: 25 },
    });
    expect(updated).toEqual({
      id: v.id,
      name: '가나',
      paymentTerms: { type: 'dayOfMonth', value: 25 },
      phone: null,
      accountNumber: null,
    });
    expect(repo.getById(v.id)).toEqual(updated);
  });

  it('remove 후 조회되지 않음', () => {
    const v = repo.create({ name: '가', paymentTerms: null });
    repo.remove(v.id);
    expect(repo.getById(v.id)).toBeNull();
  });
});

// --- Whitebox: paymentTerms 평탄화·정규화 분기 ---
describe('vendorRepository — whitebox', () => {
  it('paymentTerms null → 두 컬럼 모두 NULL 저장', () => {
    const v = repo.create({ name: '가', paymentTerms: null });
    const row = db.prepare('SELECT payment_terms_type, payment_terms_value FROM vendor WHERE id=?').get(v.id);
    expect(row).toEqual({ payment_terms_type: null, payment_terms_value: null });
    expect(repo.getById(v.id)!.paymentTerms).toBeNull();
  });

  it('net / dayOfMonth 라운드트립', () => {
    const a = repo.create({ name: 'a', paymentTerms: { type: 'net', value: 45 } });
    const b = repo.create({ name: 'b', paymentTerms: { type: 'dayOfMonth', value: 5 } });
    expect(repo.getById(a.id)!.paymentTerms).toEqual({ type: 'net', value: 45 });
    expect(repo.getById(b.id)!.paymentTerms).toEqual({ type: 'dayOfMonth', value: 5 });
  });

  it('이름은 create·update 시 trim 된다 (P0 #4)', () => {
    const v = repo.create({ name: '  가나상회  ', paymentTerms: null });
    expect(v.name).toBe('가나상회');
    expect(repo.getById(v.id)!.name).toBe('가나상회');
    const u = repo.update(v.id, { name: ' 다라 ', paymentTerms: null });
    expect(u.name).toBe('다라');
  });

  it('없는 id update → throw', () => {
    expect(() => repo.update(999, { name: 'x', paymentTerms: null })).toThrow();
  });
});
