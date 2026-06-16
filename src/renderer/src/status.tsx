import type { PaymentStatus } from '../../shared/api';

// 결제상태 색상 배지 (B). 미지급=빨강, 지급예정=노랑, 지급완료=회색.
export function StatusBadge({ status }: { status: PaymentStatus }) {
  const cls = status === '미지급' ? 'unpaid' : status === '지급예정' ? 'scheduled' : 'paid';
  return <span className={`badge ${cls}`}>{status}</span>;
}
