// 표시용 포맷 헬퍼 (렌더러 전용). 금액은 정수 원 → 천단위 콤마.
export function won(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function nullable(s: string | null): string {
  return s ?? '';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// 오늘 'YYYY-MM-DD' (로컬 시간)
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

// 결제일까지 D-day 라벨 (오늘 기준)
export function ddayLabel(dueDate: string, today: string): string {
  const diff = daysBetween(today, dueDate);
  if (diff === 0) return '오늘';
  if (diff > 0) return `${diff}일 뒤`;
  return `${-diff}일 지남`;
}
