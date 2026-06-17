// 집계 조회(요약) — 읽기 전용 (P0 #5). 엑셀의 월별/거래처별/품목별 요약 시트를 대체.
// 범위 가드(P0 #2): 고정된 집계 4종만. 임의 GROUP BY 빌더·피벗 엔진 만들지 마라.
import type { PaymentStatus } from '../domain/types';
import type { DB } from './db';

const PAID = '지급완료'; // 지급완료 외는 미지급으로 집계

export interface MonthlySummary {
  month: string; // 'YYYY-MM'
  txnCount: number; // 거래건수(명세서 수)
  vendorCount: number; // 거래처 수
  supply: number;
  vat: number;
  total: number;
  paid: number; // 지급완료 합계
  unpaid: number; // 미지급(지급완료 외) 합계
}

export interface VendorSummary {
  vendorId: number;
  vendorName: string;
  phone: string | null;
  accountNumber: string | null;
  txnCount: number;
  supply: number;
  vat: number;
  total: number;
  unpaid: number;
  lastDate: string | null; // 마지막 거래일(발행일)
}

export interface ItemSummary {
  itemName: string;
  categoryName: string | null; // 대표 카테고리(가장 많이 쓰인 것)
  totalQty: number | null; // 총수량(숫자 수량 합, 없으면 null)
  avgUnitPrice: number | null; // 평균단가 = 공급가액/총수량(반올림)
  supply: number;
  vat: number;
  total: number;
  mainVendor: string | null; // 주요 거래처(합계금액 최대)
}

export interface VendorItemSummary {
  itemName: string;
  categoryName: string | null;
  totalQty: number | null;
  supply: number;
  vat: number;
  total: number;
  lineCount: number;
}

// 한 품목의 개별 거래 줄(언제·어디서). 품목별 요약 드릴다운.
export interface ItemTransaction {
  transactionId: number; // 클릭 시 명세서로 이동·하이라이트
  issueDate: string;
  vendorName: string;
  spec: string | null;
  quantity: number | null;
  unitPrice: number | null;
  supply: number;
  total: number;
  paymentStatus: PaymentStatus;
}

export interface SummaryRepository {
  monthly(): MonthlySummary[];
  byVendor(): VendorSummary[];
  byItem(): ItemSummary[];
  vendorItems(vendorId: number): VendorItemSummary[];
  itemTransactions(itemName: string): ItemTransaction[];
}

export function createSummaryRepository(db: DB): SummaryRepository {
  return {
    // 월별: 발행월 기준 집계. 빈 달은 행이 없음(UI에서 0으로 채우거나 그대로).
    monthly() {
      return db
        .prepare(
          `SELECT substr(th.issue_date, 1, 7)              AS month,
                  COUNT(DISTINCT th.id)                    AS txnCount,
                  COUNT(DISTINCT th.vendor_id)             AS vendorCount,
                  COALESCE(SUM(ti.supply_amount), 0)       AS supply,
                  COALESCE(SUM(ti.vat), 0)                 AS vat,
                  COALESCE(SUM(ti.total), 0)               AS total,
                  COALESCE(SUM(CASE WHEN th.payment_status =  ? THEN ti.total ELSE 0 END), 0) AS paid,
                  COALESCE(SUM(CASE WHEN th.payment_status <> ? THEN ti.total ELSE 0 END), 0) AS unpaid
             FROM transaction_header th
             JOIN transaction_item ti ON ti.transaction_id = th.id
            GROUP BY month
            ORDER BY month`,
        )
        .all(PAID, PAID) as MonthlySummary[];
    },

    // 거래처별: 거래 없는 거래처도 포함(LEFT JOIN → 0). 연락처는 vendor에서.
    byVendor() {
      return db
        .prepare(
          `SELECT v.id                                     AS vendorId,
                  v.name                                   AS vendorName,
                  v.phone                                  AS phone,
                  v.account_number                         AS accountNumber,
                  COUNT(DISTINCT th.id)                    AS txnCount,
                  COALESCE(SUM(ti.supply_amount), 0)       AS supply,
                  COALESCE(SUM(ti.vat), 0)                 AS vat,
                  COALESCE(SUM(ti.total), 0)               AS total,
                  COALESCE(SUM(CASE WHEN th.payment_status <> ? THEN ti.total ELSE 0 END), 0) AS unpaid,
                  MAX(th.issue_date)                       AS lastDate
             FROM vendor v
             LEFT JOIN transaction_header th ON th.vendor_id = v.id
             LEFT JOIN transaction_item ti  ON ti.transaction_id = th.id
            GROUP BY v.id
            ORDER BY v.name`,
        )
        .all(PAID) as VendorSummary[];
    },

    // 품목별: 품목명으로 묶어 합계 + 대표 카테고리 + 주요 거래처(JS 집계가 명확).
    byItem() {
      const rows = db
        .prepare(
          `SELECT ti.name          AS itemName,
                  c.name           AS categoryName,
                  v.name           AS vendorName,
                  ti.quantity      AS quantity,
                  ti.supply_amount AS supply,
                  ti.vat           AS vat,
                  ti.total         AS total
             FROM transaction_item ti
             JOIN transaction_header th ON th.id = ti.transaction_id
             JOIN vendor v              ON v.id = th.vendor_id
             LEFT JOIN category c       ON c.id = ti.category_id`,
        )
        .all() as {
        itemName: string;
        categoryName: string | null;
        vendorName: string;
        quantity: number | null;
        supply: number;
        vat: number;
        total: number;
      }[];

      const map = new Map<
        string,
        {
          supply: number;
          vat: number;
          total: number;
          qty: number;
          hasQty: boolean;
          catCount: Map<string, number>;
          vendorTotal: Map<string, number>;
        }
      >();
      for (const r of rows) {
        let g = map.get(r.itemName);
        if (!g) {
          g = { supply: 0, vat: 0, total: 0, qty: 0, hasQty: false, catCount: new Map(), vendorTotal: new Map() };
          map.set(r.itemName, g);
        }
        g.supply += r.supply;
        g.vat += r.vat;
        g.total += r.total;
        if (typeof r.quantity === 'number') {
          g.qty += r.quantity;
          g.hasQty = true;
        }
        if (r.categoryName) g.catCount.set(r.categoryName, (g.catCount.get(r.categoryName) ?? 0) + 1);
        g.vendorTotal.set(r.vendorName, (g.vendorTotal.get(r.vendorName) ?? 0) + r.total);
      }

      const topKey = (m: Map<string, number>): string | null => {
        let best: string | null = null;
        let bestV = -Infinity;
        for (const [k, v] of m) if (v > bestV) ((bestV = v), (best = k));
        return best;
      };

      const result: ItemSummary[] = [];
      for (const [itemName, g] of map) {
        const totalQty = g.hasQty ? g.qty : null;
        result.push({
          itemName,
          categoryName: topKey(g.catCount),
          totalQty,
          avgUnitPrice: totalQty && totalQty !== 0 ? Math.round(g.supply / totalQty) : null,
          supply: g.supply,
          vat: g.vat,
          total: g.total,
          mainVendor: topKey(g.vendorTotal),
        });
      }
      result.sort((a, b) => a.itemName.localeCompare(b.itemName));
      return result;
    },

    // 거래처별 품목(드릴다운): 한 거래처의 품목명별 합계, 합계금액 큰 순.
    vendorItems(vendorId) {
      return db
        .prepare(
          `SELECT ti.name                          AS itemName,
                  MAX(c.name)                       AS categoryName,
                  SUM(CASE WHEN ti.quantity IS NOT NULL THEN ti.quantity ELSE 0 END) AS totalQtyRaw,
                  SUM(CASE WHEN ti.quantity IS NOT NULL THEN 1 ELSE 0 END)           AS qtyRows,
                  COALESCE(SUM(ti.supply_amount), 0) AS supply,
                  COALESCE(SUM(ti.vat), 0)           AS vat,
                  COALESCE(SUM(ti.total), 0)         AS total,
                  COUNT(*)                           AS lineCount
             FROM transaction_item ti
             JOIN transaction_header th ON th.id = ti.transaction_id
             LEFT JOIN category c       ON c.id = ti.category_id
            WHERE th.vendor_id = ?
            GROUP BY ti.name
            ORDER BY total DESC`,
        )
        .all(vendorId)
        .map((r) => {
          const row = r as {
            itemName: string;
            categoryName: string | null;
            totalQtyRaw: number;
            qtyRows: number;
            supply: number;
            vat: number;
            total: number;
            lineCount: number;
          };
          return {
            itemName: row.itemName,
            categoryName: row.categoryName,
            totalQty: row.qtyRows > 0 ? row.totalQtyRaw : null,
            supply: row.supply,
            vat: row.vat,
            total: row.total,
            lineCount: row.lineCount,
          } satisfies VendorItemSummary;
        });
    },

    // 한 품목명의 개별 거래 줄(거래일·거래처·수량·금액·상태), 거래일 오름차순.
    itemTransactions(itemName) {
      return db
        .prepare(
          `SELECT th.id             AS transactionId,
                  th.issue_date     AS issueDate,
                  v.name            AS vendorName,
                  ti.spec           AS spec,
                  ti.quantity       AS quantity,
                  ti.unit_price     AS unitPrice,
                  ti.supply_amount  AS supply,
                  ti.total          AS total,
                  th.payment_status AS paymentStatus
             FROM transaction_item ti
             JOIN transaction_header th ON th.id = ti.transaction_id
             JOIN vendor v              ON v.id = th.vendor_id
            WHERE ti.name = ?
            ORDER BY th.issue_date, v.name`,
        )
        .all(itemName) as ItemTransaction[];
    },
  };
}
