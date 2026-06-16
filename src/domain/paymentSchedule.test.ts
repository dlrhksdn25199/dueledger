import { describe, it, expect } from 'vitest';
import { isOverdue, classifyPayments, groupPaymentsByDate, type SchedulablePayment } from './paymentSchedule';
import { addDays, monthOf } from './dateUtil';

const TODAY = '2026-06-16';
function p(dueDate: string | null, paymentStatus: SchedulablePayment['paymentStatus'], total = 1000): SchedulablePayment {
  return { dueDate, paymentStatus, total };
}

describe('dateUtil', () => {
  it('addDays 월·연 경계', () => {
    expect(addDays('2026-06-16', 7)).toBe('2026-06-23');
    expect(addDays('2026-06-28', 7)).toBe('2026-07-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('monthOf', () => {
    expect(monthOf('2026-06-16')).toBe('2026-06');
  });
});

describe('isOverdue', () => {
  it('과거 결제일 + 미완료 = 연체', () => {
    expect(isOverdue('2026-06-15', '미지급', TODAY)).toBe(true);
  });
  it('완료면 연체 아님', () => {
    expect(isOverdue('2026-06-15', '지급완료', TODAY)).toBe(false);
  });
  it('오늘/미래는 연체 아님', () => {
    expect(isOverdue('2026-06-16', '미지급', TODAY)).toBe(false);
    expect(isOverdue('2026-06-20', '미지급', TODAY)).toBe(false);
  });
  it('결제일 없으면 연체 아님', () => {
    expect(isOverdue(null, '미지급', TODAY)).toBe(false);
  });
});

describe('classifyPayments', () => {
  it('연체/임박/예정/미정 분류 + 완료 제외', () => {
    const items = [
      p('2026-06-10', '미지급', 100), // 연체
      p('2026-06-16', '미지급', 200), // 임박(오늘)
      p('2026-06-23', '지급예정', 400), // 임박(+7 경계)
      p('2026-06-24', '미지급', 800), // 예정(+8)
      p(null, '미지급', 1600), // 미정
      p('2026-06-10', '지급완료', 9999), // 제외
    ];
    const c = classifyPayments(items, TODAY);
    expect([c.overdue.count, c.overdue.total]).toEqual([1, 100]);
    expect([c.dueSoon.count, c.dueSoon.total]).toEqual([2, 600]); // 오늘 + +7경계
    expect([c.upcoming.count, c.upcoming.total]).toEqual([1, 800]);
    expect([c.undated.count, c.undated.total]).toEqual([1, 1600]);
    expect(c.totalUnpaid).toBe(100 + 200 + 400 + 800 + 1600); // 완료 9999 제외
  });

  it('+7일 경계는 임박, +8일은 예정', () => {
    const c = classifyPayments([p(addDays(TODAY, 7), '미지급'), p(addDays(TODAY, 8), '미지급')], TODAY);
    expect(c.dueSoon.count).toBe(1);
    expect(c.upcoming.count).toBe(1);
  });

  it('빈 입력', () => {
    const c = classifyPayments([], TODAY);
    expect(c.totalUnpaid).toBe(0);
    expect(c.overdue.count).toBe(0);
  });
});

describe('groupPaymentsByDate', () => {
  it('결제일별 건수·합계·미완료수 (완료 포함 집계, 미완료수 별도)', () => {
    const g = groupPaymentsByDate([
      p('2026-06-20', '미지급', 100),
      p('2026-06-20', '지급완료', 200),
      p('2026-06-21', '지급예정', 300),
      p(null, '미지급', 999), // 제외(결제일 없음)
    ]);
    expect(g['2026-06-20']).toEqual({ count: 2, total: 300, unpaidCount: 1 });
    expect(g['2026-06-21']).toEqual({ count: 1, total: 300, unpaidCount: 1 });
    expect(g['null']).toBeUndefined();
  });
});
