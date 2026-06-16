import { describe, it, expect } from 'vitest';
import { vendorGroupKey, groupByVendor } from './grouping';

interface Row {
  vendorName: string;
  total: number;
}

// --- Blackbox: 공개 동작 (입력 → 그룹/합계 결과) ---
describe('groupByVendor — blackbox', () => {
  it('거래처별로 묶고 합계를 낸다', () => {
    const rows: Row[] = [
      { vendorName: '가나상회', total: 1000 },
      { vendorName: '다라식품', total: 2000 },
      { vendorName: '가나상회', total: 500 },
    ];
    const groups = groupByVendor(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ vendorName: '가나상회', total: 1500 });
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1]).toMatchObject({ vendorName: '다라식품', total: 2000 });
  });

  it('그룹 순서 = 첫 등장 순서', () => {
    const rows: Row[] = [
      { vendorName: '나', total: 1 },
      { vendorName: '가', total: 1 },
      { vendorName: '나', total: 1 },
    ];
    expect(groupByVendor(rows).map((g) => g.key)).toEqual(['나', '가']);
  });

  it('빈 입력 → 빈 결과', () => {
    expect(groupByVendor([])).toEqual([]);
  });
});

// --- Whitebox: trim 정규화 분기·경계 ---
describe('vendorGroupKey / groupByVendor — whitebox', () => {
  it('앞뒤 공백을 제거해 같은 그룹으로 묶는다', () => {
    expect(vendorGroupKey('가나상회 ')).toBe('가나상회');
    expect(vendorGroupKey('  가나상회  ')).toBe('가나상회');
    const groups = groupByVendor([
      { vendorName: '가나상회', total: 100 },
      { vendorName: '가나상회 ', total: 200 }, // 뒤 공백
      { vendorName: ' 가나상회', total: 300 }, // 앞 공백
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(600);
  });

  it('탭·복수 공백도 trim 대상', () => {
    expect(vendorGroupKey('\t가나상회\t')).toBe('가나상회');
  });

  it('내부 공백은 보존 — 서로 다른 거래처', () => {
    const groups = groupByVendor([
      { vendorName: 'A 상회', total: 1 },
      { vendorName: 'A상회', total: 1 },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('합계는 정수 덧셈 (부동소수 개입 없음)', () => {
    const groups = groupByVendor([
      { vendorName: 'x', total: 333 },
      { vendorName: 'x', total: 333 },
      { vendorName: 'x', total: 334 },
    ]);
    expect(groups[0].total).toBe(1000);
    expect(Number.isInteger(groups[0].total)).toBe(true);
  });
});
