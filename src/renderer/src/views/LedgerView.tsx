import { useCallback, useEffect, useState } from 'react';
import type {
  Category,
  LedgerQuery,
  LedgerRow,
  PaymentStatus,
  SortColumn,
  Transaction,
  Vendor,
} from '../../../shared/api';
import { won, nullable, todayISO } from '../format';
import { isOverdue } from '../../../domain/paymentSchedule';
import { StatusBadge } from '../status';
import { TransactionForm } from './TransactionForm';

const PAYMENT_STATUSES: PaymentStatus[] = ['미지급', '지급예정', '지급완료'];

// 정렬 가능한 컬럼 헤더 (CLAUDE.md: 거래일자·거래처·카테고리·공급가액·합계·결제상태·결제일)
const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'issueDate', label: '거래일자' },
  { key: 'vendorName', label: '거래처' },
  { key: 'categoryName', label: '카테고리' },
  { key: 'supplyAmount', label: '공급가액' },
  { key: 'total', label: '합계' },
  { key: 'paymentStatus', label: '결제상태' },
  { key: 'dueDate', label: '결제일' },
];

export function LedgerView() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [vendorId, setVendorId] = useState('');
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'issueDate',
    direction: 'desc',
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const today = todayISO();

  const reload = useCallback(async () => {
    const query: LedgerQuery = { sort };
    const filter: LedgerQuery['filter'] = {};
    if (vendorId !== '') filter.vendorId = Number(vendorId);
    if (status !== '') filter.paymentStatus = status as PaymentStatus;
    if (month !== '') filter.month = month;
    if (Object.keys(filter).length) query.filter = filter;
    if (search.trim() !== '') query.search = search;
    setRows(await window.api.ledger.list(query));
  }, [vendorId, status, month, search, sort]);

  const loadLists = useCallback(async () => {
    setVendors(await window.api.vendor.list());
    setCategories(await window.api.category.list());
  }, []);
  useEffect(() => {
    void loadLists();
  }, [loadLists]);
  useEffect(() => {
    void reload();
  }, [reload]);

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    );
  }
  function sortMark(column: SortColumn): string {
    if (sort.column !== column) return '';
    return sort.direction === 'asc' ? ' ▲' : ' ▼';
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  async function openEdit(transactionId: number) {
    const t = await window.api.transaction.get(transactionId);
    if (t) {
      setEditing(t);
      setFormOpen(true);
    }
  }
  async function removeTransaction(transactionId: number) {
    if (!confirm('이 명세서를 삭제할까요? (품목 전체 삭제)')) return;
    await window.api.transaction.remove(transactionId);
    await reload();
  }

  return (
    <div className="view">
      <section className="toolbar">
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">전체 거래처</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체 결제상태</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input
          placeholder="검색 (품목·거래처·비고)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="spacer" />
        <button className="primary" onClick={openNew}>
          + 새 명세서
        </button>
      </section>

      <table className="grid ledger">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className="sortable" onClick={() => toggleSort(c.key)}>
                {c.label}
                {sortMark(c.key)}
              </th>
            ))}
            <th>품목</th>
            <th>규격</th>
            <th>수량</th>
            <th>부가세</th>
            <th>비고</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId}>
              <td>{r.issueDate}</td>
              <td>{r.vendorName}</td>
              <td>{nullable(r.categoryName)}</td>
              <td className="num">{won(r.supplyAmount)}</td>
              <td className="num">{won(r.total)}</td>
              <td>
                <StatusBadge status={r.paymentStatus} />
              </td>
              <td className={isOverdue(r.dueDate, r.paymentStatus, today) ? 'overdue' : ''}>
                {nullable(r.dueDate)}
              </td>
              <td>{r.itemName}</td>
              <td>{nullable(r.spec)}</td>
              <td className="num">{r.quantity ?? ''}</td>
              <td className="num">{won(r.vat)}</td>
              <td>{nullable(r.memo)}</td>
              <td className="row-actions">
                <button onClick={() => void openEdit(r.transactionId)}>수정</button>
                <button className="danger" onClick={() => void removeTransaction(r.transactionId)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={13} className="empty">
                표시할 명세서가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {formOpen && (
        <TransactionForm
          vendors={vendors}
          categories={categories}
          editing={editing}
          onSaved={() => {
            setFormOpen(false);
            void loadLists(); // 인라인 생성된 거래처·카테고리 반영
            void reload();
          }}
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
