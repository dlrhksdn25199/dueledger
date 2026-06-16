// 결제 일정 분류 (홈 대시보드 + 캘린더의 핵심 로직 — 엑셀이 못 하는 "언제 얼마 줘야 하나").
// 순수 함수: today를 인자로 받아 테스트 가능하게. 금액은 정수 원 합산.
import type { PaymentStatus } from './types';
import { addDays } from './dateUtil';

export interface SchedulablePayment {
  dueDate: string | null;
  paymentStatus: PaymentStatus;
  total: number;
}

// 결제 대상 = 아직 안 낸 것 (지급완료 제외)
function isOpen(p: SchedulablePayment): boolean {
  return p.paymentStatus !== '지급완료';
}

// 연체 = 결제일이 오늘보다 과거인데 아직 미완료
export function isOverdue(
  dueDate: string | null,
  paymentStatus: PaymentStatus,
  today: string,
): boolean {
  return dueDate !== null && paymentStatus !== '지급완료' && dueDate < today;
}

export interface Bucket<T> {
  count: number;
  total: number;
  items: T[];
}

export interface PaymentClassification<T> {
  overdue: Bucket<T>; // 연체 (결제일 지남, 미완료)
  dueSoon: Bucket<T>; // 임박 (오늘~7일 이내)
  upcoming: Bucket<T>; // 그 이후 예정
  undated: Bucket<T>; // 결제일 미정 (거래처 결제조건 없음)
  totalUnpaid: number; // 미완료 전체 합계
}

function emptyBucket<T>(): Bucket<T> {
  return { count: 0, total: 0, items: [] };
}
function push<T extends SchedulablePayment>(b: Bucket<T>, item: T): void {
  b.count += 1;
  b.total += item.total;
  b.items.push(item);
}

// 미완료 결제를 연체/임박/예정/미정으로 분류. 지급완료는 전부 제외.
export function classifyPayments<T extends SchedulablePayment>(
  items: readonly T[],
  today: string,
): PaymentClassification<T> {
  const soonEnd = addDays(today, 7); // 오늘 포함 7일 이내
  const result: PaymentClassification<T> = {
    overdue: emptyBucket(),
    dueSoon: emptyBucket(),
    upcoming: emptyBucket(),
    undated: emptyBucket(),
    totalUnpaid: 0,
  };
  for (const item of items) {
    if (!isOpen(item)) continue;
    result.totalUnpaid += item.total;
    if (item.dueDate === null) push(result.undated, item);
    else if (item.dueDate < today) push(result.overdue, item);
    else if (item.dueDate <= soonEnd) push(result.dueSoon, item);
    else push(result.upcoming, item);
  }
  return result;
}

export interface DayCell {
  count: number; // 그날 결제 건수 (상태 무관)
  total: number; // 그날 결제 합계
  unpaidCount: number; // 그중 미완료 건수
}

// 결제일별 집계 (캘린더 셀용). dueDate 있는 것만. 키 = 'YYYY-MM-DD'.
export function groupPaymentsByDate<T extends SchedulablePayment>(
  items: readonly T[],
): Record<string, DayCell> {
  const map: Record<string, DayCell> = {};
  for (const item of items) {
    if (item.dueDate === null) continue;
    const cell = (map[item.dueDate] ??= { count: 0, total: 0, unpaidCount: 0 });
    cell.count += 1;
    cell.total += item.total;
    if (isOpen(item)) cell.unpaidCount += 1;
  }
  return map;
}
