// 거래처별 그룹핑·합계 (도메인 규칙).
// ⚠️ 거래처명은 trim 후 비교 — 실데이터에 뒤쪽 공백이 섞여 있어 같은 거래처가 갈라지면 안 됨 (P0 #4).
// 금액 합계는 정수(원) 덧셈만 (P0 #6d).

// 그룹 키 = 거래처명 trim. (내부 공백은 보존 — "A 상회"와 "A상회"는 다른 거래처)
export function vendorGroupKey(name: string): string {
  return name.trim();
}

export interface VendorGroup<T> {
  key: string; // trim된 그룹 키
  vendorName: string; // 표시용 이름 (= 키)
  rows: T[];
  total: number; // Σ rows.total
}

// 평면 행 목록을 거래처별로 묶고 합계 계산. 그룹 순서 = 첫 등장 순서.
export function groupByVendor<T extends { vendorName: string; total: number }>(
  rows: readonly T[],
): VendorGroup<T>[] {
  const groups = new Map<string, VendorGroup<T>>();
  for (const row of rows) {
    const key = vendorGroupKey(row.vendorName);
    let group = groups.get(key);
    if (!group) {
      group = { key, vendorName: key, rows: [], total: 0 };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.total += row.total;
  }
  return [...groups.values()];
}
