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
}

export interface Transaction {
  id: number;
  vendorId: number;
  issueDate: string;
  dueDate: string | null; // 거래처 결제조건 적용값 (조건 없으면 null)
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

export interface TransactionRepository {
  create(input: TransactionInput): Transaction;
  getById(id: number): Transaction | null;
  update(id: number, input: TransactionInput): Transaction;
  remove(id: number): void;
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

  const insertHeader = db.prepare(
    `INSERT INTO transaction_header (vendor_id, issue_date, due_date, payment_status, memo)
     VALUES (?, ?, ?, ?, ?)`,
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
      const dueDate = computeDue(input.vendorId, input.issueDate);
      const tx = db.transaction(() => {
        const headerId = Number(
          insertHeader.run(input.vendorId, input.issueDate, dueDate, input.paymentStatus, input.memo)
            .lastInsertRowid,
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
        paymentStatus: header.payment_status,
        memo: header.memo,
        items,
      };
    },

    // 명세서 편집 = 헤더 갱신 + 품목 전량 교체(삭제 후 재삽입). 1인 앱이라 단순·정확 우선.
    update(id, input) {
      const dueDate = computeDue(input.vendorId, input.issueDate);
      const tx = db.transaction(() => {
        const info = db
          .prepare(
            `UPDATE transaction_header
               SET vendor_id = ?, issue_date = ?, due_date = ?, payment_status = ?, memo = ?
             WHERE id = ?`,
          )
          .run(input.vendorId, input.issueDate, dueDate, input.paymentStatus, input.memo, id);
        if (info.changes === 0) throw new Error(`Transaction not found: ${id}`);
        db.prepare(`DELETE FROM transaction_item WHERE transaction_id = ?`).run(id);
        insertItems(id, input.items);
      });
      tx();
      return repo.getById(id)!;
    },

    remove(id) {
      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM transaction_item WHERE transaction_id = ?`).run(id);
        db.prepare(`DELETE FROM transaction_header WHERE id = ?`).run(id);
      });
      tx();
    },
  };
  return repo;
}
