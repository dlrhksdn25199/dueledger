import { describe, it, expect } from 'vitest';
import { computeVat, computeTotal, defaultSupplyAmount, DEFAULT_TAX_RATE } from './amount';

describe('computeVat', () => {
  it('과세: 공급가액 × 10% (기본 세율)', () => {
    expect(computeVat(10000, '과세')).toBe(1000);
    expect(computeVat(100000, '과세')).toBe(10000);
  });

  it('과세: 0.5 올림 경계 (12,345 → 1,235)', () => {
    expect(computeVat(12345, '과세')).toBe(1235);
    expect(computeVat(54321, '과세')).toBe(5432); // 5432.1 → 5432
  });

  it('면세: 항상 0', () => {
    expect(computeVat(10000, '면세')).toBe(0);
    expect(computeVat(12345, '면세')).toBe(0);
  });

  it('편집된 세율 적용', () => {
    expect(computeVat(10000, '과세', 0.05)).toBe(500);
  });

  it('기본 세율 상수는 0.1', () => {
    expect(DEFAULT_TAX_RATE).toBe(0.1);
  });
});

describe('computeTotal', () => {
  it('합계 = 공급가액 + 부가세', () => {
    expect(computeTotal(10000, 1000)).toBe(11000);
    expect(computeTotal(12345, 0)).toBe(12345); // 면세
  });
});

describe('defaultSupplyAmount', () => {
  it('수량·단가 둘 다 숫자면 수량×단가', () => {
    expect(defaultSupplyAmount(3, 5000)).toBe(15000);
  });

  it('하나라도 없으면 null (직접 입력)', () => {
    expect(defaultSupplyAmount(null, 5000)).toBeNull();
    expect(defaultSupplyAmount(3, null)).toBeNull();
    expect(defaultSupplyAmount(undefined, undefined)).toBeNull();
  });
});
