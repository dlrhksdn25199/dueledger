// 앱 설정 데이터 접근 (P0 #5). 현재는 편집 가능한 부가세율(taxRate) 하나만.
// 제네릭 설정 프레임워크가 아니다 — 필요한 키만 타입 안전 메서드로 노출 (YAGNI).
import { DEFAULT_TAX_RATE } from '../domain/amount';
import type { DB } from './db';

const TAX_RATE_KEY = 'taxRate';

// taxRate는 쓰기 시점에 vat 계산에 쓰이는 파라미터라 repository 밖에서도 읽는다(transaction/import 적재).
// 그래서 standalone 함수로도 제공 — 조건: 0 이상 1 이하(0%~100%)의 유한수.
export function getTaxRate(db: DB): number {
  const row = db.prepare(`SELECT value FROM app_setting WHERE key = ?`).get(TAX_RATE_KEY) as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_TAX_RATE;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : DEFAULT_TAX_RATE;
}

export function setTaxRate(db: DB, rate: number): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`Invalid tax rate: ${rate} (0~1 사이 값이어야 함)`);
  }
  db.prepare(
    `INSERT INTO app_setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(TAX_RATE_KEY, String(rate));
}

export interface SettingsRepository {
  getTaxRate(): number;
  setTaxRate(rate: number): void;
}

export function createSettingsRepository(db: DB): SettingsRepository {
  return {
    getTaxRate: () => getTaxRate(db),
    setTaxRate: (rate) => setTaxRate(db, rate),
  };
}
