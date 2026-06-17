// 원장(품목 줄) → 외부 공유용 엑셀(.xlsx) 내보내기. DB 직접 호출 ❌ — 받은 행을 시트로 변환만.
// 컬럼은 입력 양식과 동일 순서로(받는 쪽이 익숙하게): 거래일자·거래처·카테고리·품목·규격·수량·단가·공급가액·과세구분·부가세·합계·결제상태·결제일·비고.
import xlsx from 'xlsx';
import type { LedgerRow } from '../repository/ledgerRepository';

const HEADER = [
  '거래일자', '거래처', '카테고리', '품목', '규격', '수량', '단가',
  '공급가액', '과세구분', '부가세', '합계', '결제상태', '결제일', '비고',
] as const;

function rowToArray(r: LedgerRow): (string | number | null)[] {
  return [
    r.issueDate,
    r.vendorName,
    r.categoryName,
    r.itemName,
    r.spec,
    r.quantity,
    r.unitPrice,
    r.supplyAmount,
    r.taxType,
    r.vat,
    r.total,
    r.paymentStatus,
    r.dueDate,
    r.memo,
  ];
}

// 받은 원장 행으로 워크북을 만들어 파일로 저장. 금액은 숫자 셀(엑셀에서 합계·정렬 가능).
export function writeLedgerWorkbook(filePath: string, rows: LedgerRow[]): void {
  const aoa: (string | number | null)[][] = [HEADER as unknown as string[], ...rows.map(rowToArray)];
  const ws = xlsx.utils.aoa_to_sheet(aoa);
  // 보기 좋게 열 너비 약간 지정(선택).
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
    { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 16 },
  ];
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, '거래명세');
  xlsx.writeFile(wb, filePath);
}
