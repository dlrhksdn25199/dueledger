// 초기 카테고리 시드 (P0 #4 초기 데이터). 앱 첫 실행 시 1회 — openDatabase엔 엮지 않는다(시드는 앱 init 관심사).
// 유저가 자유롭게 추가/수정/삭제하므로 시드는 "빈 DB일 때만". 멱등.
import type { DB } from './db';

// 실데이터 기준 기본 분류. 부재료/부자재/원재료 등은 유저가 추가.
export const INITIAL_CATEGORIES = ['식자재', '포장재', '소모품', '위생용품', '기타'] as const;

export function seedCategories(db: DB): void {
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM category`).get() as { c: number };
  if (c > 0) return; // 이미 카테고리가 있으면 건드리지 않음
  const insert = db.prepare(`INSERT INTO category (name) VALUES (?)`);
  const tx = db.transaction(() => {
    for (const name of INITIAL_CATEGORIES) insert.run(name);
  });
  tx();
}
