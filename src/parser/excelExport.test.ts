import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import xlsx from 'xlsx';
import { writeLedgerWorkbook } from './excelExport';
import type { LedgerRow } from '../repository/ledgerRepository';

const tmpFiles: string[] = [];
function tmpXlsx(): string {
  const p = join(tmpdir(), `dueledger-export-${process.pid}-${tmpFiles.length}.xlsx`);
  tmpFiles.push(p);
  return p;
}
afterEach(() => {
  for (const f of tmpFiles.splice(0)) rmSync(f, { force: true });
});

function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    itemId: 1,
    transactionId: 1,
    issueDate: '2026-04-22',
    dueDate: '2026-04-22',
    vendorId: 1,
    vendorName: '가나상사',
    categoryId: 1,
    categoryName: '원재료',
    itemName: '돈까스',
    spec: '1BOX',
    quantity: 100,
    unitPrice: 1000,
    supplyAmount: 100000,
    taxType: '과세',
    vat: 10000,
    total: 110000,
    paymentStatus: '미지급',
    memo: null,
    ...over,
  };
}

describe('writeLedgerWorkbook', () => {
  it('헤더 + 행을 거래명세 시트로 내보낸다 (금액은 숫자 셀)', () => {
    const path = tmpXlsx();
    writeLedgerWorkbook(path, [row(), row({ itemName: '단무지', taxType: '면세', vat: 0, total: 300000, supplyAmount: 300000 })]);

    const wb = xlsx.readFile(path);
    expect(wb.SheetNames).toContain('거래명세');
    const aoa = xlsx.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets['거래명세'], {
      header: 1,
      raw: true,
      defval: null,
    });
    // 헤더
    expect(aoa[0]).toEqual([
      '거래일자', '거래처', '카테고리', '품목', '규격', '수량', '단가',
      '공급가액', '과세구분', '부가세', '합계', '결제상태', '결제일', '비고',
    ]);
    // 1행: 값 매핑
    expect(aoa[1][0]).toBe('2026-04-22'); // 거래일자
    expect(aoa[1][1]).toBe('가나상사'); // 거래처
    expect(aoa[1][7]).toBe(100000); // 공급가액 = 숫자
    expect(aoa[1][9]).toBe(10000); // 부가세
    expect(aoa[1][10]).toBe(110000); // 합계
    // 2행: 면세
    expect(aoa[2][8]).toBe('면세');
    expect(aoa[2][9]).toBe(0);
    expect(aoa).toHaveLength(3); // 헤더 + 2행
  });

  it('빈 목록도 헤더만 있는 시트를 만든다', () => {
    const path = tmpXlsx();
    writeLedgerWorkbook(path, []);
    const wb = xlsx.readFile(path);
    const aoa = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets['거래명세'], { header: 1, defval: null });
    expect(aoa).toHaveLength(1); // 헤더만
  });
});
