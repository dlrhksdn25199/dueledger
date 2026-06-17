import type { PaymentStatus } from '../../shared/api';

// 결제상태 색상 배지 (B). 미지급=빨강, 지급예정=노랑, 지급완료=초록.
// onClick을 주면 클릭 가능한 버튼으로(명세서 목록에서 상태 토글), 없으면 표시용 span.
export function StatusBadge({ status, onClick }: { status: PaymentStatus; onClick?: () => void }) {
  const cls = status === '미지급' ? 'unpaid' : status === '지급예정' ? 'scheduled' : 'paid';
  if (onClick) {
    return (
      <button type="button" className={`badge ${cls} badge-btn`} onClick={onClick} title="클릭하여 결제상태 변경">
        {status}
      </button>
    );
  }
  return <span className={`badge ${cls}`}>{status}</span>;
}
