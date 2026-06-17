// 거래처 데이터 접근 (P0 #5: DB 접근은 여기서만). paymentTerms는 두 컬럼으로 평탄화 저장.
import type { PaymentTerms } from '../domain/types';
import type { DB } from './db';

export interface VendorInput {
  name: string;
  paymentTerms: PaymentTerms | null;
  phone?: string | null; // 전화번호 (자유 입력, 선택)
  accountNumber?: string | null; // 계좌번호 (자유 입력, 선택)
}

export interface Vendor {
  id: number;
  name: string;
  paymentTerms: PaymentTerms | null;
  phone: string | null;
  accountNumber: string | null;
}

interface VendorRow {
  id: number;
  name: string;
  payment_terms_type: 'net' | 'dayOfMonth' | null;
  payment_terms_value: number | null;
  phone: string | null;
  account_number: string | null;
}

function rowToVendor(row: VendorRow): Vendor {
  const paymentTerms: PaymentTerms | null =
    row.payment_terms_type === null || row.payment_terms_value === null
      ? null
      : { type: row.payment_terms_type, value: row.payment_terms_value };
  return {
    id: row.id,
    name: row.name,
    paymentTerms,
    phone: row.phone,
    accountNumber: row.account_number,
  };
}

// 빈 문자열은 null로 정규화(자유 입력 필드).
function nullIfBlank(s: string | null): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

export interface VendorRepository {
  create(input: VendorInput): Vendor;
  getAll(): Vendor[];
  getById(id: number): Vendor | null;
  update(id: number, input: VendorInput): Vendor;
  remove(id: number): void;
}

export function createVendorRepository(db: DB): VendorRepository {
  const repo: VendorRepository = {
    create(input) {
      const name = input.name.trim(); // 정규화: 거래처명 trim (P0 #4)
      const t = input.paymentTerms;
      const phone = nullIfBlank(input.phone ?? null);
      const accountNumber = nullIfBlank(input.accountNumber ?? null);
      const info = db
        .prepare(
          `INSERT INTO vendor (name, payment_terms_type, payment_terms_value, phone, account_number)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(name, t?.type ?? null, t?.value ?? null, phone, accountNumber);
      return { id: Number(info.lastInsertRowid), name, paymentTerms: t, phone, accountNumber };
    },

    getAll() {
      const rows = db
        .prepare(`SELECT * FROM vendor ORDER BY name`)
        .all() as VendorRow[];
      return rows.map(rowToVendor);
    },

    getById(id) {
      const row = db.prepare(`SELECT * FROM vendor WHERE id = ?`).get(id) as
        | VendorRow
        | undefined;
      return row ? rowToVendor(row) : null;
    },

    update(id, input) {
      const name = input.name.trim();
      const t = input.paymentTerms;
      const phone = nullIfBlank(input.phone ?? null);
      const accountNumber = nullIfBlank(input.accountNumber ?? null);
      const info = db
        .prepare(
          `UPDATE vendor
             SET name = ?, payment_terms_type = ?, payment_terms_value = ?, phone = ?, account_number = ?
           WHERE id = ?`,
        )
        .run(name, t?.type ?? null, t?.value ?? null, phone, accountNumber, id);
      if (info.changes === 0) throw new Error(`Vendor not found: ${id}`);
      return { id, name, paymentTerms: t, phone, accountNumber };
    },

    remove(id) {
      db.prepare(`DELETE FROM vendor WHERE id = ?`).run(id);
    },
  };
  return repo;
}
