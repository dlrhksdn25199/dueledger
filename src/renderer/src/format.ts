// 표시용 포맷 헬퍼 (렌더러 전용). 금액은 정수 원 → 천단위 콤마.
export function won(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function nullable(s: string | null): string {
  return s ?? '';
}
