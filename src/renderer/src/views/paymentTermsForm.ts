// 결제조건 ↔ 폼 상태 변환 (거래처 편집 · 임포트 후 설정에서 공유).
import type { PaymentTerms } from '../../../shared/api';

export type TermsType = 'none' | 'net' | 'dayOfMonth';

export const TERMS_LABEL: Record<TermsType, string> = {
  none: '없음',
  net: '발행일+N일 (net)',
  dayOfMonth: '매월 N일',
};

export function termsToForm(t: PaymentTerms | null): { type: TermsType; value: string } {
  if (!t) return { type: 'none', value: '' };
  return { type: t.type, value: String(t.value) };
}

export function formToTerms(type: TermsType, value: string): PaymentTerms | null {
  if (type === 'none') return null;
  return { type, value: Number(value) };
}
