import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import {
  createCategoryRepository,
  CategoryInUseError,
  type CategoryRepository,
} from './categoryRepository';

let db: DB;
let repo: CategoryRepository;
beforeEach(() => {
  db = openDatabase(':memory:');
  repo = createCategoryRepository(db);
});

// 카테고리를 참조하는 품목 1줄을 직접 심는다 (transaction repo 미구현 → 테스트 픽스처).
function seedItemUsing(categoryId: number): void {
  const vid = Number(db.prepare(`INSERT INTO vendor (name) VALUES ('v')`).run().lastInsertRowid);
  const tid = Number(
    db.prepare(`INSERT INTO transaction_header (vendor_id, issue_date) VALUES (?, '2026-06-16')`).run(vid).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO transaction_item (transaction_id, category_id, name, supply_amount, tax_type, vat, total)
     VALUES (?, ?, '품목', 1000, '과세', 100, 1100)`,
  ).run(tid, categoryId);
}

// --- Blackbox: CRUD ---
describe('categoryRepository — blackbox CRUD', () => {
  it('create → getAll(이름 순)', () => {
    repo.create('포장재');
    repo.create('식자재');
    expect(repo.getAll().map((c) => c.name)).toEqual(['식자재', '포장재']);
  });

  it('rename 이 이름을 바꾼다', () => {
    const c = repo.create('소모품');
    repo.rename(c.id, '위생용품');
    expect(repo.getById(c.id)!.name).toBe('위생용품');
  });

  it('미사용 카테고리는 삭제된다', () => {
    const c = repo.create('기타');
    repo.remove(c.id);
    expect(repo.getById(c.id)).toBeNull();
  });
});

// --- Whitebox: 정규화 + 사용 중 삭제 차단 (P0 #4) ---
describe('categoryRepository — whitebox', () => {
  it('이름 trim', () => {
    expect(repo.create('  식자재  ').name).toBe('식자재');
  });

  it('countItemsUsing 가 참조 건수를 센다', () => {
    const c = repo.create('식자재');
    expect(repo.countItemsUsing(c.id)).toBe(0);
    seedItemUsing(c.id);
    seedItemUsing(c.id);
    expect(repo.countItemsUsing(c.id)).toBe(2);
  });

  it('사용 중 삭제는 차단 — CategoryInUseError(건수 포함), 조용한 재분류 금지', () => {
    const c = repo.create('식자재');
    seedItemUsing(c.id);
    expect(() => repo.remove(c.id)).toThrow(CategoryInUseError);
    try {
      repo.remove(c.id);
    } catch (e) {
      expect(e).toBeInstanceOf(CategoryInUseError);
      expect((e as CategoryInUseError).itemCount).toBe(1);
    }
    // 차단됐으니 그대로 존재
    expect(repo.getById(c.id)).not.toBeNull();
  });

  it('재지정 후에는 삭제 가능', () => {
    const c = repo.create('식자재');
    seedItemUsing(c.id);
    db.prepare(`UPDATE transaction_item SET category_id = NULL`).run(); // 미분류로 재지정
    expect(() => repo.remove(c.id)).not.toThrow();
    expect(repo.getById(c.id)).toBeNull();
  });

  it('없는 id rename → throw', () => {
    expect(() => repo.rename(999, 'x')).toThrow();
  });
});
