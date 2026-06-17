// 명세서(헤더+품목) 데이터 접근 (P0 #5). 다품목: 명세서 1장 = 품목 여러 줄.
// ⚠️ 파생값(vat·total·dueDate)은 쓰기 시점에 domain 함수로 계산해 저장한다.
//    UI가 계산해 넘기지 않음 — 유일한 쓰기 게이트에서 공식 불변식을 강제 (P0 #1 + #5).
import type { PaymentStatus, PaymentTerms, TaxType } from '../domain/types';
import { computeVat, computeTotal } from '../domain/amount';
import { computeDueDate } from '../domain/paymentDate';
import type { DB } from './db';

export interface TransactionItemInput {
  categoryId: number | null;
  name: string;
  spec: string | null;
  quantity: number | null; // 비숫자 수량은 null
  unitPrice: number | null;
  supplyAmount: number; // 공급가액 = 입력의 진실 (정수 원)
  taxType: TaxType;
}

export interface TransactionItem extends TransactionItemInput {
  id: number;
  transactionId: number;
  vat: number;
  total: number;
}

export interface TransactionInput {
  vendorId: number;
  issueDate: string; // 'YYYY-MM-DD'
  paymentStatus: PaymentStatus;
  memo: string | null;
  items: TransactionItemInput[];
  // 결제일 수동 지정(선택). true면 dueDate를 자동 계산하지 않고 아래 값을 그대로 저장.
  dueDateOverridden?: boolean;
  dueDate?: string | null;
}

export interface Transaction {
  id: number;
  vendorId: number;
  issueDate: string;
  dueDate: string | null; // 거래처 결제조건 적용값 (조건 없으면 null). 수동 지정 시 그 값.
  dueDateOverridden: boolean; // true면 사용자가 직접 지정 (자동 재계산 안 함)
  paymentStatus: PaymentStatus;
  memo: string | null;
  items: TransactionItem[];
}

interface ItemRow {
  id: number;
  transaction_id: number;
  category_id: number | null;
  name: string;
  spec: string | null;
  quantity: number | null;
  unit_price: number | null;
  supply_amount: number;
  tax_type: TaxType;
  vat: number;
  total: number;
}

interface HeaderRow {
  id: number;
  vendor_id: number;
  due_date_overridden: number;
  updated_at: string | null;
  issue_date: string;
  due_date: string | null;
  payment_status: PaymentStatus;
  memo: string | null;
}

function rowToItem(r: ItemRow): TransactionItem {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    categoryId: r.category_id,
    name: r.name,
    spec: r.spec,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    supplyAmount: r.supply_amount,
    taxType: r.tax_type,
    vat: r.vat,
    total: r.total,
  };
}

// 명세서 1장 단위 결제 요약 (홈 대시보드·캘린더용). total = 그 명세서 품목 합계.
export interface TransactionSummary {
  id: number;
  vendorId: number;
  vendorName: string;
  issueDate: string;
  dueDate: string | null;
  paymentStatus: PaymentStatus;
  total: number;
  itemCount: number;
}

export interface TransactionRepository {
  create(input: TransactionInput): Transaction;
  getById(id: number): Transaction | null;
  update(id: number, input: TransactionInput): Transaction;
  setPaymentStatus(id: number, status: PaymentStatus): void; // 결제상태만 빠르게 변경(목록에서 토글)
  setIssueDate(id: number, issueDate: string): void; // 발행일만 변경(미수동지정이면 결제일 재계산)
  setDueDate(id: number, dueDate: string): void; // 결제일 직접 지정(수동 플래그 ON)
  remove(id: number): void;
  listSummaries(): TransactionSummary[];
  listRecent(limit: number): TransactionSummary[];
}

export function createTransactionRepository(db: DB): TransactionRepository {
  // 거래처 결제조건 조회 → dueDate 계산용. 조건 없으면 null.
  function vendorPaymentTerms(vendorId: number): PaymentTerms | null {
    const row = db
      .prepare(`SELECT payment_terms_type AS type, payment_terms_value AS value FROM vendor WHERE id = ?`)
      .get(vendorId) as { type: 'net' | 'dayOfMonth' | null; value: number | null } | undefined;
    if (!row || row.type === null || row.value === null) return null;
    return { type: row.type, value: row.value };
  }

  // dueDate = 결제조건을 발행일에 적용 (조건 없으면 null).
  function computeDue(vendorId: number, issueDate: string): string | null {
    const terms = vendorPaymentTerms(vendorId);
    return terms ? computeDueDate(issueDate, terms) : null;
  }

  // 수동 지정이면 입력값 그대로, 아니면 자동 계산.
  function resolveDue(input: TransactionInput): { dueDate: string | null; overridden: number } {
    if (input.dueDateOverridden) return { dueDate: input.dueDate ?? null, overridden: 1 };
    return { dueDate: computeDue(input.vendorId, input.issueDate), overridden: 0 };
  }

  const insertHeader = db.prepare(
    `INSERT INTO transaction_header (vendor_id, issue_date, due_date, due_date_overridden, payment_status, memo, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertItem = db.prepare(
    `INSERT INTO transaction_item
       (transaction_id, category_id, name, spec, quantity, unit_price, supply_amount, tax_type, vat, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  function insertItems(transactionId: number, items: TransactionItemInput[]): void {
    for (const it of items) {
      const vat = computeVat(it.supplyAmount, it.taxType); // 면세=0, 과세=round(공급가액×세율)
      const total = computeTotal(it.supplyAmount, vat);
      insertItem.run(
        transactionId,
        it.categoryId,
        it.name,
        it.spec,
        it.quantity,
        it.unitPrice,
        it.supplyAmount,
        it.taxType,
        vat,
        total,
      );
    }
  }

  const repo: TransactionRepository = {
    create(input) {
      const { dueDate, overridden } = resolveDue(input);
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        const headerId = Number(
          insertHeader.run(
            input.vendorId,
            input.issueDate,
            dueDate,
            overridden,
            input.paymentStatus,
            input.memo,
            now,
          ).lastInsertRowid,
        );
        insertItems(headerId, input.items);
        return headerId;
      });
      const id = tx();
      return repo.getById(id)!;
    },

    getById(id) {
      const header = db.prepare(`SELECT * FROM transaction_header WHERE id = ?`).get(id) as
        | HeaderRow
        | undefined;
      if (!header) return null;
      const items = (
        db.prepare(`SELECT * FROM transaction_item WHERE transaction_id = ? ORDER BY id`).all(id) as ItemRow[]
      ).map(rowToItem);
      return {
        id: header.id,
        vendorId: header.vendor_id,
        issueDate: header.issue_date,
        dueDate: header.due_date,
        dueDateOverridden: header.due_date_overridden === 1,
        paymentStatus: header.payment_status,
        memo: header.memo,
        items,
      };
    },

    // 명세서 편집 = 헤더 갱신 + 품목 전량 교체(삭제 후 재삽입). 1인 앱이라 단순·정확 우선.
    update(id, input) {
      const { dueDate, overridden } = resolveDue(input);
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        const info = db
          .prepare(
            `UPDATE transaction_header
               SET vendor_id = ?, issue_date = ?, due_date = ?, due_date_overridden = ?,
                   payment_status = ?, memo = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(input.vendorId, input.issueDate, dueDate, overridden, input.paymentStatus, input.memo, now, id);
        if (info.changes === 0) throw new Error(`Transaction not found: ${id}`);
        db.prepare(`DELETE FROM transaction_item WHERE transaction_id = ?`).run(id);
        insertItems(id, input.items);
      });
      tx();
      return repo.getById(id)!;
    },

    // 결제상태만 변경(헤더 1줄). 품목·dueDate는 건드리지 않음. 목록에서 배지 클릭 토글용.
    setPaymentStatus(id, status) {
      const now = new Date().toISOString();
      const info = db
        .prepare(`UPDATE transaction_header SET payment_status = ?, updated_at = ? WHERE id = ?`)
        .run(status, now, id);
      if (info.changes === 0) throw new Error(`Transaction not found: ${id}`);
    },

    // 발행일만 변경(목록 인라인 편집). 결제일 수동지정이면 결제일 유지, 아니면 거래처 조건으로 재계산.
    setIssueDate(id, issueDate) {
      const now = new Date().toISOString();
      const header = db
        .prepare(`SELECT vendor_id AS vendorId, due_date_overridden AS overridden FROM transaction_header WHERE id = ?`)
        .get(id) as { vendorId: number; overridden: number } | undefined;
      if (!header) throw new Error(`Transaction not found: ${id}`);
      if (header.overridden === 1) {
        db.prepare(`UPDATE transaction_header SET issue_date = ?, updated_at = ? WHERE id = ?`).run(issueDate, now, id);
      } else {
        const dueDate = computeDue(header.vendorId, issueDate);
        db.prepare(`UPDATE transaction_header SET issue_date = ?, due_date = ?, updated_at = ? WHERE id = ?`).run(
          issueDate,
          dueDate,
          now,
          id,
        );
      }
    },

    // 결제일 직접 지정(목록 인라인 편집) → 수동 플래그 ON(이후 발행일 바꿔도 유지).
    setDueDate(id, dueDate) {
      const now = new Date().toISOString();
      const info = db
        .prepare(`UPDATE transaction_header SET due_date = ?, due_date_overridden = 1, updated_at = ? WHERE id = ?`)
        .run(dueDate, now, id);
      if (info.changes === 0) throw new Error(`Transaction not found: ${id}`);
    },

    remove(id) {
      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM transaction_item WHERE transaction_id = ?`).run(id);
        db.prepare(`DELETE FROM transaction_header WHERE id = ?`).run(id);
      });
      tx();
    },

    // 명세서 단위 요약 — 품목 합계(total)를 한 줄로. 결제일 빠른 것부터(미정은 뒤).
    listSummaries() {
      const rows = db
        .prepare(
          `SELECT th.id              AS id,
                  th.vendor_id        AS vendorId,
                  v.name              AS vendorName,
                  th.issue_date       AS issueDate,
                  th.due_date         AS dueDate,
                  th.payment_status   AS paymentStatus,
                  COALESCE(SUM(ti.total), 0) AS total,
                  COUNT(ti.id)        AS itemCount
             FROM transaction_header th
             JOIN vendor v ON v.id = th.vendor_id
             LEFT JOIN transaction_item ti ON ti.transaction_id = th.id
            GROUP BY th.id
            ORDER BY th.due_date IS NULL, th.due_date ASC`,
        )
        .all() as TransactionSummary[];
      return rows;
    },

    // 최근 생성/수정된 명세서 (홈 "최근 건드린 것"). updated_at 내림차순, 동률·NULL은 id 내림차순.
    listRecent(limit) {
      return db
        .prepare(
          `SELECT th.id              AS id,
                  th.vendor_id        AS vendorId,
                  v.name              AS vendorName,
                  th.issue_date       AS issueDate,
                  th.due_date         AS dueDate,
                  th.payment_status   AS paymentStatus,
                  COALESCE(SUM(ti.total), 0) AS total,
                  COUNT(ti.id)        AS itemCount
             FROM transaction_header th
             JOIN vendor v ON v.id = th.vendor_id
             LEFT JOIN transaction_item ti ON ti.transaction_id = th.id
            GROUP BY th.id
            ORDER BY th.updated_at DESC, th.id DESC
            LIMIT ?`,
        )
        .all(limit) as TransactionSummary[];
    },
  };
  return repo;
}
