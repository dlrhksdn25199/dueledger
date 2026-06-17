// 엑셀 → 데이터 일괄 이관 파서 (선택 기능, CLAUDE.md "parser/"). DB 직접 호출 ❌ — 순수 매핑만.
// 이 회사 양식 1개(`거래명세 입력` 시트)만 대상. 자동감지·멀티회사 금지.
// 컬럼맵(역설계): B거래일자 D거래처 E카테고리 F품목 G규격 H수량 I단가 J공급가액 K과세구분 N결제상태 O비고.
import xlsx from 'xlsx';
import type { PaymentStatus, TaxType } from '../domain/types';

// 입력 시트명 + 헤더 행(0-based). 헤더 다음 행부터 데이터.
const INPUT_SHEET = '거래명세 입력';
const HEADER_ROW_INDEX = 3;

// 컬럼 인덱스(0-based = 엑셀 열 A=0). 헤더 라벨이 아니라 위치로 읽는다(양식 고정).
const COL = {
  issueDate: 1, // B 거래일자 (엑셀 serial 또는 날짜 문자열)
  vendor: 3, // D 거래처명
  category: 4, // E 카테고리
  itemName: 5, // F 품목명
  spec: 6, // G 규격/단위
  quantity: 7, // H 수량 (비숫자 가능 — "2박스")
  unitPrice: 8, // I 단가
  supplyAmount: 9, // J 공급가액 (= 입력의 진실)
  taxType: 10, // K 과세구분
  paymentStatus: 13, // N 결제상태
  memo: 14, // O 비고
} as const;

const TAX_TYPES: readonly TaxType[] = ['과세', '면세'];
const PAYMENT_STATUSES: readonly PaymentStatus[] = ['미지급', '지급예정', '지급완료'];

// 한 명세서로 묶이기 전, 엑셀 한 줄 = 한 품목.
export interface ParsedItem {
  categoryName: string | null; // 미존재 시 임포트에서 자동 생성
  name: string;
  spec: string | null;
  quantity: number | null; // 비숫자 수량은 null (원문은 spec에 보존)
  unitPrice: number | null;
  supplyAmount: number; // 정수 원
  taxType: TaxType;
}

// 같은 거래일자+거래처 = 명세서 1장(결제 단위).
export interface ParsedStatement {
  vendorName: string;
  issueDate: string; // 'YYYY-MM-DD'
  paymentStatus: PaymentStatus;
  memo: string | null;
  items: ParsedItem[];
}

export interface ParseResult {
  statements: ParsedStatement[];
  importedRows: number; // 유효 품목 줄 수
  skippedRows: number; // 필수값(거래일자·거래처·품목·공급가액) 빠져 제외한 줄 수
  warnings: string[];
}

type Cell = string | number | boolean | null | undefined;

function trimOrNull(v: Cell): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// 엑셀 serial(예: 46134) 또는 날짜 문자열 → 'YYYY-MM-DD'. 변환 불가면 null.
function toISODate(v: Cell): string | null {
  if (typeof v === 'number') {
    const d = xlsx.SSF.parse_date_code(v);
    if (!d) return null;
    const mm = String(d.m).padStart(2, '0');
    const dd = String(d.d).padStart(2, '0');
    return `${d.y}-${mm}-${dd}`;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    // 이미 'YYYY-MM-DD' 류면 앞 10자만.
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) {
      const [, y, mo, da] = m;
      return `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
    }
  }
  return null;
}

// 정수 금액으로 정규화. 숫자면 반올림(정수 원), 콤마 섞인 문자열도 허용. 불가면 null.
function toIntOrNull(v: Cell): number | null {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]/g, ''));
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

// 수량: 숫자만 number, 그 외(텍스트 "2박스" 등·빈칸)는 null.
function toQuantityOrNull(v: Cell): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function normTaxType(v: Cell): TaxType {
  const s = trimOrNull(v);
  return s && (TAX_TYPES as string[]).includes(s) ? (s as TaxType) : '과세';
}

function normPaymentStatus(v: Cell): PaymentStatus {
  const s = trimOrNull(v);
  return s && (PAYMENT_STATUSES as string[]).includes(s) ? (s as PaymentStatus) : '미지급';
}

// 거래명세서 워크북(이 회사 양식) → 명세서 목록. 입력 시트 1개만 읽는다.
export function parseLedgerWorkbook(filePath: string): ParseResult {
  const wb = xlsx.readFile(filePath, { raw: true });
  const ws = wb.Sheets[INPUT_SHEET];
  if (!ws) {
    throw new Error(`입력 시트 '${INPUT_SHEET}'를 찾을 수 없습니다. 이 회사 거래명세서 양식인지 확인하세요.`);
  }
  const rows = xlsx.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null });

  const warnings: string[] = [];
  let skippedRows = 0;
  // 그룹: 거래일자+거래처 → 명세서. 첫 등장 순서 보존.
  const order: string[] = [];
  const groups = new Map<string, ParsedStatement>();

  for (let i = HEADER_ROW_INDEX + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const vendor = trimOrNull(r[COL.vendor]);
    const issueDate = toISODate(r[COL.issueDate]);
    const itemName = trimOrNull(r[COL.itemName]);
    const supplyAmount = toIntOrNull(r[COL.supplyAmount]);

    // 빈 템플릿 줄은 조용히 건너뜀. 식별 정보(거래처·날짜·품목)가 셋 다 없으면 빈 줄로 본다 —
    // 공급가액 칸은 빈 행에도 수식이 0을 캐시하므로 판정에서 제외(0을 데이터로 오인 금지).
    const blank = !vendor && !issueDate && !itemName;
    if (blank) continue;

    // 필수값 누락 = 불완전 줄 → 스킵 + 경고.
    if (!vendor || !issueDate || !itemName || supplyAmount == null) {
      skippedRows++;
      const ref = vendor ?? itemName ?? `행 ${i + 1}`;
      warnings.push(`불완전한 줄 제외: ${ref} (거래일자·거래처·품목·공급가액 필요)`);
      continue;
    }

    // 텍스트 수량은 원문을 규격에 보존(데이터 손실 방지).
    const rawQty = r[COL.quantity];
    const quantity = toQuantityOrNull(rawQty);
    let spec = trimOrNull(r[COL.spec]);
    if (quantity === null && typeof rawQty !== 'number') {
      const qtext = trimOrNull(rawQty);
      if (qtext) spec = spec ? `${spec} (${qtext})` : qtext;
    }

    const item: ParsedItem = {
      categoryName: trimOrNull(r[COL.category]),
      name: itemName,
      spec,
      quantity,
      unitPrice: toIntOrNull(r[COL.unitPrice]),
      supplyAmount,
      taxType: normTaxType(r[COL.taxType]),
    };

    const key = `${issueDate}|${vendor}`;
    let stmt = groups.get(key);
    if (!stmt) {
      stmt = {
        vendorName: vendor,
        issueDate,
        paymentStatus: normPaymentStatus(r[COL.paymentStatus]),
        memo: null,
        items: [],
      };
      groups.set(key, stmt);
      order.push(key);
    }
    stmt.items.push(item);

    // 비고: 그룹 내 서로 다른 비고를 모아 헤더 memo에 보존.
    const memo = trimOrNull(r[COL.memo]);
    if (memo) {
      stmt.memo = stmt.memo ? (stmt.memo.includes(memo) ? stmt.memo : `${stmt.memo}; ${memo}`) : memo;
    }
  }

  const statements = order.map((k) => groups.get(k)!);
  const importedRows = statements.reduce((n, s) => n + s.items.length, 0);
  return { statements, importedRows, skippedRows, warnings };
}
