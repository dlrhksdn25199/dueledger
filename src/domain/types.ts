// 도메인 공용 타입 — 금액·결제 규칙에서 쓰는 최소 정의 (CLAUDE.md 데이터 모델 발췌)

// 한국 부가세 2-값 (고정 enum, 값 추가는 코드 한 줄)
export type TaxType = '과세' | '면세';

// 결제 상태 (수동 필드, 계산값 dueDate와 별개). 값 추가는 코드 한 줄.
export type PaymentStatus = '미지급' | '지급예정' | '지급완료';

// 거래처별 결제조건 (사용자 설정 데이터):
//   net        → 발행일 + value일 (net-30 등)
//   dayOfMonth → 매월 value일
export type PaymentTerms =
  | { type: 'net'; value: number }
  | { type: 'dayOfMonth'; value: number };
