import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import { createCategoryRepository } from './categoryRepository';
import { seedCategories, INITIAL_CATEGORIES } from './seed';

let db: DB;
beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('seedCategories', () => {
  it('빈 DB에 기본 카테고리를 넣는다', () => {
    seedCategories(db);
    const names = createCategoryRepository(db).getAll().map((c) => c.name);
    expect(names).toEqual([...INITIAL_CATEGORIES].sort((a, b) => a.localeCompare(b)));
    expect(names).toHaveLength(5);
  });

  it('멱등 — 두 번 호출해도 중복 없음', () => {
    seedCategories(db);
    seedCategories(db);
    expect(createCategoryRepository(db).getAll()).toHaveLength(5);
  });

  it('이미 카테고리가 있으면 건드리지 않는다', () => {
    createCategoryRepository(db).create('내가만든것');
    seedCategories(db);
    const names = createCategoryRepository(db).getAll().map((c) => c.name);
    expect(names).toEqual(['내가만든것']); // 시드 미투입
  });
});
