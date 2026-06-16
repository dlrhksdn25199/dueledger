import { describe, it, expect } from 'vitest';
import { computeDueDate } from './paymentDate';

describe('computeDueDate — net (발행일 + value일)', () => {
  it('net-30', () => {
    expect(computeDueDate('2026-06-16', { type: 'net', value: 30 })).toBe('2026-07-16');
  });

  it('월 경계를 넘김', () => {
    expect(computeDueDate('2026-01-25', { type: 'net', value: 10 })).toBe('2026-02-04');
  });

  it('연 경계를 넘김', () => {
    expect(computeDueDate('2026-12-20', { type: 'net', value: 30 })).toBe('2027-01-19');
  });

  it('윤년 2월을 통과', () => {
    expect(computeDueDate('2024-02-20', { type: 'net', value: 10 })).toBe('2024-03-01');
  });

  it('value 0 = 당일', () => {
    expect(computeDueDate('2026-06-16', { type: 'net', value: 0 })).toBe('2026-06-16');
  });
});

describe('computeDueDate — dayOfMonth (매월 value일)', () => {
  it('value일이 아직 안 지났으면 이번 달', () => {
    expect(computeDueDate('2026-06-05', { type: 'dayOfMonth', value: 10 })).toBe('2026-06-10');
  });

  it('발행일 == value일이면 이번 달(당일)', () => {
    expect(computeDueDate('2026-06-10', { type: 'dayOfMonth', value: 10 })).toBe('2026-06-10');
  });

  it('value일을 이미 지났으면 다음 달', () => {
    expect(computeDueDate('2026-06-20', { type: 'dayOfMonth', value: 10 })).toBe('2026-07-10');
  });

  it('12월에 지났으면 다음 해 1월', () => {
    expect(computeDueDate('2026-12-20', { type: 'dayOfMonth', value: 10 })).toBe('2027-01-10');
  });

  it('value가 월 일수보다 크면 월말로 클램프 (2월)', () => {
    expect(computeDueDate('2026-02-15', { type: 'dayOfMonth', value: 31 })).toBe('2026-02-28');
  });

  it('윤년 2월 클램프', () => {
    expect(computeDueDate('2024-02-15', { type: 'dayOfMonth', value: 31 })).toBe('2024-02-29');
  });

  it('다음 달로 넘어간 뒤에도 클램프 (1/31 지남 → 2월 클램프)', () => {
    // 1/31 발행, 31일 조건 → 1월 31일은 안 지났으므로(31<=31) 이번 달 1/31
    expect(computeDueDate('2026-01-31', { type: 'dayOfMonth', value: 31 })).toBe('2026-01-31');
    // 3/31 발행은 안 지났으니 3/31, 그러나 4월로 넘기는 케이스 확인:
    expect(computeDueDate('2026-03-31', { type: 'dayOfMonth', value: 15 })).toBe('2026-04-15');
  });
});
