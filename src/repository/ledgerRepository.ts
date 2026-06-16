// 테이블 뷰("데이터베이스처럼") 조회 — 품목 줄 ⨝ 헤더 ⨝ 거래처 ⨝ 카테고리 평면 행 (P0 #5).
// 범위 가드(P0 #2): 단순 컬럼 정렬 + 고정 필터 + LIKE만. 쿼리 DSL·동적 컬럼 빌더 금지.
import type { PaymentStatus, TaxType } from '../domain/types';
import type { DB } from './db';

export interface LedgerRow {
  itemId: number;
  transactionId: number;
  issueDate: string;
  dueDate: string | null;
  vendorId: number;
  vendorName: string;
  categoryId: number | null;
  categoryName: string | null;
  itemName: string;
  spec: string | null;
  quantity: number | null;
  unitPrice: number | null;
  supplyAmount: number;
  taxType: TaxType;
  vat: number;
  total: number;
  paymentStatus: PaymentStatus;
  memo: string | null;
}

export type SortColumn =
  | 'issueDate'
  | 'vendorName'
  | 'categoryName'
  | 'supplyAmount'
  | 'total'
  | 'paymentStatus'
  | 'dueDate';

// 정렬 화이트리스트 — 외부 입력을 SQL에 직접 박지 않도록 고정 매핑(주입 차단).
// 금액(supply_amount/total)은 INTEGER 컬럼이라 숫자 정렬, 날짜는 'YYYY-MM-DD'라 사전식=연대순 (P0 #4).
const SORT_SQL: Record<SortColumn, string> = {
  issueDate: 'th.issue_date',
  vendorName: 'v.name',
  categoryName: 'c.name',
  supplyAmount: 'ti.supply_amount',
  total: 'ti.total',
  paymentStatus: 'th.payment_status',
  dueDate: 'th.due_date',
};

export interface LedgerFilter {
  vendorId?: number;
  categoryId?: number;
  paymentStatus?: PaymentStatus;
  taxType?: TaxType;
  month?: string; // 발행월 'YYYY-MM'
  dueDateFrom?: string; // 결제일 기간 시작 (포함)
  dueDateTo?: string; // 결제일 기간 끝 (포함)
}

export interface LedgerQuery {
  filter?: LedgerFilter;
  search?: string; // 품목명·거래처명·비고 부분일치
  sort?: { column: SortColumn; direction: 'asc' | 'desc' };
}

const BASE_SELECT = `
  SELECT
    ti.id            AS itemId,
    ti.transaction_id AS transactionId,
    th.issue_date    AS issueDate,
    th.due_date      AS dueDate,
    v.id             AS vendorId,
    v.name           AS vendorName,
    c.id             AS categoryId,
    c.name           AS categoryName,
    ti.name          AS itemName,
    ti.spec          AS spec,
    ti.quantity      AS quantity,
    ti.unit_price    AS unitPrice,
    ti.supply_amount AS supplyAmount,
    ti.tax_type      AS taxType,
    ti.vat           AS vat,
    ti.total         AS total,
    th.payment_status AS paymentStatus,
    th.memo          AS memo
  FROM transaction_item ti
  JOIN transaction_header th ON th.id = ti.transaction_id
  JOIN vendor v             ON v.id = th.vendor_id
  LEFT JOIN category c      ON c.id = ti.category_id
`;

export interface LedgerRepository {
  list(query?: LedgerQuery): LedgerRow[];
}

export function createLedgerRepository(db: DB): LedgerRepository {
  return {
    list(query = {}) {
      const where: string[] = [];
      const params: unknown[] = [];
      const f = query.filter ?? {};

      if (f.vendorId !== undefined) {
        where.push('th.vendor_id = ?');
        params.push(f.vendorId);
      }
      if (f.categoryId !== undefined) {
        where.push('ti.category_id = ?');
        params.push(f.categoryId);
      }
      if (f.paymentStatus !== undefined) {
        where.push('th.payment_status = ?');
        params.push(f.paymentStatus);
      }
      if (f.taxType !== undefined) {
        where.push('ti.tax_type = ?');
        params.push(f.taxType);
      }
      if (f.month !== undefined) {
        where.push("substr(th.issue_date, 1, 7) = ?");
        params.push(f.month);
      }
      if (f.dueDateFrom !== undefined) {
        where.push('th.due_date >= ?');
        params.push(f.dueDateFrom);
      }
      if (f.dueDateTo !== undefined) {
        where.push('th.due_date <= ?');
        params.push(f.dueDateTo);
      }

      // 검색: 품목명·거래처명·비고 LIKE. 거래처명은 trim 후 저장돼 있어 검색어만 trim.
      if (query.search !== undefined && query.search.trim() !== '') {
        const like = `%${query.search.trim()}%`;
        where.push('(ti.name LIKE ? OR v.name LIKE ? OR th.memo LIKE ?)');
        params.push(like, like, like);
      }

      // 정렬: 화이트리스트로만. 기본 = 발행일 내림차순(최근 먼저), id로 안정화.
      const sortCol = query.sort ? SORT_SQL[query.sort.column] : undefined;
      if (query.sort && sortCol === undefined) {
        throw new Error(`Invalid sort column: ${query.sort.column}`);
      }
      const dir = query.sort?.direction === 'desc' ? 'DESC' : 'ASC';
      const orderBy = sortCol
        ? `ORDER BY ${sortCol} ${dir}, ti.id ASC`
        : `ORDER BY th.issue_date DESC, ti.id ASC`;

      const sql = `${BASE_SELECT}${
        where.length ? `WHERE ${where.join(' AND ')}\n` : ''
      }${orderBy}`;
      return db.prepare(sql).all(...params) as LedgerRow[];
    },
  };
}
