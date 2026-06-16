// 날짜 유틸 ('YYYY-MM-DD' 문자열 기준, UTC 산술로 타임존 함정 회피).
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

// 'YYYY-MM' (발행월·결제월 비교용)
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
