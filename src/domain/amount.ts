// 금액·세액 규칙 (실엑셀 역설계로 고정 — CLAUDE.md "금액 규칙").
// 의존 사슬: 수량×단가 →(선택)→ 공급가액 → 부가세 → 합계.
// 금액은 전부 정수(원). 부동소수 금지 (P0 #6d).
import type { TaxType } from './types';

// 부가세 기본 세율 — 편집 가능 파라미터 (호출부에서 덮어쓰기)
export const DEFAULT_TAX_RATE = 0.1;

// 공급가액 기본값 제안: 수량·단가가 둘 다 숫자면 수량×단가, 아니면 null(직접 입력).
// ⚠️ 공급가액이 입력의 진실 — 이 값은 보조 제안일 뿐이고 수량/단가는 nullable.
//    실데이터 절반이 총액만 있거나 수량이 "2박스" 같은 텍스트라 수량/단가를 필수로 만들지 않는다.
export function defaultSupplyAmount(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
): number | null {
  if (typeof quantity === 'number' && typeof unitPrice === 'number') {
    return quantity * unitPrice;
  }
  return null;
}

// 부가세 = 면세면 0, 과세면 round(공급가액 × 세율).
// 엑셀 ROUND = 0.5 올림. 금액이 양수라 Math.round와 동일.
export function computeVat(
  supplyAmount: number,
  taxType: TaxType,
  taxRate: number = DEFAULT_TAX_RATE,
): number {
  if (taxType === '면세') return 0;
  return Math.round(supplyAmount * taxRate);
}

// 합계 = 공급가액 + 부가세
export function computeTotal(supplyAmount: number, vat: number): number {
  return supplyAmount + vat;
}
