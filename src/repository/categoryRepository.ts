// 카테고리 데이터 접근 (P0 #5). 카테고리는 관리 엔티티 — CRUD + 사용 중 삭제 차단(P0 #4).
import type { DB } from './db';

export interface Category {
  id: number;
  name: string;
}

// 사용 중인 카테고리 삭제 시도 — UI가 "N건 재지정 후 삭제"를 안내하도록 건수를 담는다.
export class CategoryInUseError extends Error {
  constructor(
    public readonly categoryId: number,
    public readonly itemCount: number,
  ) {
    super(`Category ${categoryId} is in use by ${itemCount} item(s)`);
    this.name = 'CategoryInUseError';
  }
}

export interface CategoryRepository {
  create(name: string): Category;
  getAll(): Category[];
  getById(id: number): Category | null;
  rename(id: number, name: string): Category;
  countItemsUsing(id: number): number;
  remove(id: number): void;
}

export function createCategoryRepository(db: DB): CategoryRepository {
  const repo: CategoryRepository = {
    create(name) {
      const trimmed = name.trim();
      const info = db.prepare(`INSERT INTO category (name) VALUES (?)`).run(trimmed);
      return { id: Number(info.lastInsertRowid), name: trimmed };
    },

    getAll() {
      return db.prepare(`SELECT * FROM category ORDER BY name`).all() as Category[];
    },

    getById(id) {
      const row = db.prepare(`SELECT * FROM category WHERE id = ?`).get(id) as
        | Category
        | undefined;
      return row ?? null;
    },

    rename(id, name) {
      const trimmed = name.trim();
      const info = db
        .prepare(`UPDATE category SET name = ? WHERE id = ?`)
        .run(trimmed, id);
      if (info.changes === 0) throw new Error(`Category not found: ${id}`);
      return { id, name: trimmed };
    },

    countItemsUsing(id) {
      const row = db
        .prepare(`SELECT COUNT(*) AS c FROM transaction_item WHERE category_id = ?`)
        .get(id) as { c: number };
      return row.c;
    },

    // 사용 중이면 삭제 거부(기본 정책) — 조용한 재분류 금지. 재지정 후 삭제.
    remove(id) {
      const count = repo.countItemsUsing(id);
      if (count > 0) throw new CategoryInUseError(id, count);
      db.prepare(`DELETE FROM category WHERE id = ?`).run(id);
    },
  };
  return repo;
}
