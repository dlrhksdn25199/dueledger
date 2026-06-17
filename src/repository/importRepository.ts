// 엑셀 파싱 결과를 DB에 일괄 적재 (P0 #5: 데이터 접근은 여기서만). 한 트랜잭션 = 전부 아니면 전무.
// 정책(사용자 결정):
//   - 결제일 = 거래일자(발행일)로 두고 수동지정 플래그 ON. 거래처 결제조건은 비움 → 나중에 직접 설정.
//   - 중복(거래일자+거래처+품목명+공급가액 동일)은 건너뜀. 같은 파일/재임포트 모두.
//   - 미존재 거래처·카테고리는 자동 생성(이름 trim).
// 파생값(vat·total)은 여기서도 domain 함수로 계산(P0 #1 불변식).
import { computeVat, computeTotal } from '../domain/amount';
import type { ParseResult, ParsedItem, ParsedStatement } from '../parser/excelImport';
import type { DB } from './db';

export interface ImportSummary {
  newStatements: number; // 생성될/생성된 명세서 수
  newItems: number; // 생성될/생성된 품목 줄 수
  duplicateItems: number; // 중복으로 건너뛴 품목 줄 수
  newVendors: string[]; // 새로 생길/생긴 거래처명
  newCategories: string[]; // 새로 생길/생긴 카테고리명
  skippedRows: number; // 파서가 제외한 불완전 줄
  warnings: string[];
}

export interface ImportRepository {
  preview(parsed: ParseResult): ImportSummary; // 쓰기 없음 — 미리보기 집계만
  commit(parsed: ParseResult): ImportSummary; // 한 트랜잭션으로 적재
}

// 중복 판정 키 — 거래일자|거래처id|품목명|공급가액.
function itemKey(issueDate: string, vendorId: number, name: string, supplyAmount: number): string {
  return `${issueDate}|${vendorId}|${name}|${supplyAmount}`;
}

// 한 번의 계획 수립: 기존 거래처/카테고리/품목을 읽어 신규·중복을 분류.
// 쓰기는 하지 않는다. preview는 집계만, commit은 이 계획을 실행한다.
interface Plan {
  vendorIdByName: Map<string, number>; // 기존 + (commit이 채울) 신규
  categoryIdByName: Map<string, number>;
  existingItemKeys: Set<string>;
  newVendorNames: string[];
  newCategoryNames: string[];
  // 적재 대상: 신규 품목이 1개 이상인 명세서만. 각 명세서의 신규 품목만 추림.
  toInsert: { statement: ParsedStatement; items: ParsedItem[] }[];
  duplicateItems: number;
}

export function createImportRepository(db: DB): ImportRepository {
  function buildPlan(parsed: ParseResult): Plan {
    const vendorIdByName = new Map<string, number>();
    for (const v of db.prepare(`SELECT id, name FROM vendor`).all() as { id: number; name: string }[]) {
      vendorIdByName.set(v.name.trim(), v.id);
    }
    const categoryIdByName = new Map<string, number>();
    for (const c of db.prepare(`SELECT id, name FROM category`).all() as { id: number; name: string }[]) {
      categoryIdByName.set(c.name.trim(), c.id);
    }
    // 기존 품목 중복키 — 거래일자(헤더)+거래처+품목명+공급가액.
    const existingItemKeys = new Set<string>();
    const rows = db
      .prepare(
        `SELECT th.issue_date AS issueDate, th.vendor_id AS vendorId, ti.name AS name, ti.supply_amount AS supplyAmount
           FROM transaction_item ti
           JOIN transaction_header th ON th.id = ti.transaction_id`,
      )
      .all() as { issueDate: string; vendorId: number; name: string; supplyAmount: number }[];
    for (const r of rows) existingItemKeys.add(itemKey(r.issueDate, r.vendorId, r.name, r.supplyAmount));

    const newVendorNames: string[] = [];
    const newCategoryNames: string[] = [];
    const seenNewVendor = new Set<string>();
    const seenNewCategory = new Set<string>();

    // 신규 거래처/카테고리는 아직 id가 없다 → 임시로 음수 placeholder를 매핑(중복키 계산용으로 유일하면 됨).
    let placeholder = -1;
    function resolveVendorId(name: string): number {
      const existing = vendorIdByName.get(name);
      if (existing != null) return existing;
      if (!seenNewVendor.has(name)) {
        seenNewVendor.add(name);
        newVendorNames.push(name);
        vendorIdByName.set(name, placeholder--);
      }
      return vendorIdByName.get(name)!;
    }
    function noteCategory(name: string): void {
      if (categoryIdByName.has(name) || seenNewCategory.has(name)) return;
      seenNewCategory.add(name);
      newCategoryNames.push(name);
    }

    const seenKeys = new Set(existingItemKeys); // 파일 내 자기중복도 건너뛰기 위해 누적
    const toInsert: Plan['toInsert'] = [];
    let duplicateItems = 0;

    for (const stmt of parsed.statements) {
      const vendorId = resolveVendorId(stmt.vendorName);
      const freshItems: ParsedItem[] = [];
      for (const it of stmt.items) {
        if (it.categoryName) noteCategory(it.categoryName);
        const key = itemKey(stmt.issueDate, vendorId, it.name, it.supplyAmount);
        if (seenKeys.has(key)) {
          duplicateItems++;
          continue;
        }
        seenKeys.add(key);
        freshItems.push(it);
      }
      if (freshItems.length > 0) toInsert.push({ statement: stmt, items: freshItems });
    }

    return {
      vendorIdByName,
      categoryIdByName,
      existingItemKeys,
      newVendorNames,
      newCategoryNames,
      toInsert,
      duplicateItems,
    };
  }

  function summarize(parsed: ParseResult, plan: Plan): ImportSummary {
    return {
      newStatements: plan.toInsert.length,
      newItems: plan.toInsert.reduce((n, s) => n + s.items.length, 0),
      duplicateItems: plan.duplicateItems,
      newVendors: plan.newVendorNames,
      newCategories: plan.newCategoryNames,
      skippedRows: parsed.skippedRows,
      warnings: parsed.warnings,
    };
  }

  const repo: ImportRepository = {
    preview(parsed) {
      return summarize(parsed, buildPlan(parsed));
    },

    commit(parsed) {
      const plan = buildPlan(parsed);
      const now = new Date().toISOString();

      const insertVendor = db.prepare(`INSERT INTO vendor (name, payment_terms_type, payment_terms_value) VALUES (?, NULL, NULL)`);
      const insertCategory = db.prepare(`INSERT INTO category (name) VALUES (?)`);
      // 결제일 = 거래일자, 수동지정(overridden=1) — 거래처 결제조건이 없어도 결제일을 비우지 않는다.
      const insertHeader = db.prepare(
        `INSERT INTO transaction_header (vendor_id, issue_date, due_date, due_date_overridden, payment_status, memo, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
      );
      const insertItem = db.prepare(
        `INSERT INTO transaction_item
           (transaction_id, category_id, name, spec, quantity, unit_price, supply_amount, tax_type, vat, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const tx = db.transaction(() => {
        // 1) 신규 거래처/카테고리 실제 생성 → 실제 id로 맵 갱신.
        for (const name of plan.newVendorNames) {
          const id = Number(insertVendor.run(name).lastInsertRowid);
          plan.vendorIdByName.set(name, id);
        }
        for (const name of plan.newCategoryNames) {
          const id = Number(insertCategory.run(name).lastInsertRowid);
          plan.categoryIdByName.set(name, id);
        }
        // 2) 명세서 헤더 + 신규 품목 적재.
        for (const { statement, items } of plan.toInsert) {
          const vendorId = plan.vendorIdByName.get(statement.vendorName)!;
          const headerId = Number(
            insertHeader.run(
              vendorId,
              statement.issueDate,
              statement.issueDate, // due_date = issue_date
              statement.paymentStatus,
              statement.memo,
              now,
            ).lastInsertRowid,
          );
          for (const it of items) {
            const categoryId = it.categoryName ? (plan.categoryIdByName.get(it.categoryName) ?? null) : null;
            const vat = computeVat(it.supplyAmount, it.taxType);
            const total = computeTotal(it.supplyAmount, vat);
            insertItem.run(
              headerId,
              categoryId,
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
      });
      tx();

      return summarize(parsed, plan);
    },
  };
  return repo;
}
