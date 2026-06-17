// 메인↔렌더러 IPC 계약. preload(구현)·ipc(핸들러)·renderer(호출)가 공유하는 단일 타입 소스.
// DTO 타입은 repository에서 재노출 (전부 type-only → 렌더러 번들에 better-sqlite3 안 딸려옴).
import type { Vendor, VendorInput } from '../repository/vendorRepository';
import type { Category } from '../repository/categoryRepository';
import type { Transaction, TransactionInput, TransactionSummary } from '../repository/transactionRepository';
import type { LedgerRow, LedgerQuery } from '../repository/ledgerRepository';
import type { ImportSummary } from '../repository/importRepository';
import type { PaymentStatus } from '../domain/types';

export type { Vendor, VendorInput } from '../repository/vendorRepository';
export type { ImportSummary } from '../repository/importRepository';
export type { Category } from '../repository/categoryRepository';
export type {
  Transaction,
  TransactionInput,
  TransactionItem,
  TransactionItemInput,
  TransactionSummary,
} from '../repository/transactionRepository';
export type { LedgerRow, LedgerQuery, SortColumn, LedgerFilter } from '../repository/ledgerRepository';
export type { TaxType, PaymentStatus, PaymentTerms } from '../domain/types';

export interface Api {
  vendor: {
    list(): Promise<Vendor[]>;
    create(input: VendorInput): Promise<Vendor>;
    update(id: number, input: VendorInput): Promise<Vendor>;
    remove(id: number): Promise<void>;
  };
  category: {
    list(): Promise<Category[]>;
    create(name: string): Promise<Category>;
    rename(id: number, name: string): Promise<Category>;
    countItemsUsing(id: number): Promise<number>;
    remove(id: number): Promise<void>;
  };
  transaction: {
    get(id: number): Promise<Transaction | null>;
    create(input: TransactionInput): Promise<Transaction>;
    update(id: number, input: TransactionInput): Promise<Transaction>;
    setPaymentStatus(id: number, status: PaymentStatus): Promise<void>;
    setIssueDate(id: number, date: string): Promise<void>;
    setDueDate(id: number, date: string): Promise<void>;
    remove(id: number): Promise<void>;
    listSummaries(): Promise<TransactionSummary[]>;
    listRecent(limit: number): Promise<TransactionSummary[]>;
  };
  ledger: {
    list(query?: LedgerQuery): Promise<LedgerRow[]>;
  };
  import: {
    // 파일 선택 대화상자 → 선택한 .xlsx 경로(취소 시 null).
    openDialog(): Promise<string | null>;
    // 적재 전 미리보기(쓰기 없음): 신규/중복/자동생성 집계.
    preview(filePath: string): Promise<ImportSummary>;
    // 한 트랜잭션으로 적재.
    commit(filePath: string): Promise<ImportSummary>;
  };
  // 현재 조회 결과를 .xlsx로 내보내기(저장 대화상자). 취소 시 null.
  exportLedger(query?: LedgerQuery): Promise<{ path: string; count: number } | null>;
}
