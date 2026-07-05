import { Fragment, useEffect, useState } from 'react';
import type {
  MonthlySummary,
  VendorSummary,
  ItemSummary,
  VendorItemSummary,
  ItemTransaction,
  OutstandingVendorSummary,
  OutstandingItemSummary,
} from '../../../shared/api';
import { won, nullable } from '../format';
import { StatusBadge } from '../status';

type Sub = 'monthly' | 'vendor' | 'outstanding' | 'item';

const SUBS: { key: Sub; label: string }[] = [
  { key: 'monthly', label: '월별 요약' },
  { key: 'vendor', label: '거래처별 요약' },
  { key: 'outstanding', label: '미수금' },
  { key: 'item', label: '품목별 요약' },
];

// 기본 조회 월 = 전월(YYYY-MM). '미수금' 탭 초기값.
function prevMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// YYYY-MM을 delta개월만큼 이동(방향키·◀▶ 월 이동용).
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function SummaryView({
  onOpenTransaction,
}: { onOpenTransaction?: (id: number) => void } = {}) {
  const [sub, setSub] = useState<Sub>('monthly');
  const [outstandingMonth, setOutstandingMonth] = useState<string>(prevMonthISO());
  // 월별 요약 행 클릭 → 그 달 미수금 탭으로 이동.
  function openOutstanding(month: string) {
    setOutstandingMonth(month);
    setSub('outstanding');
  }
  return (
    <div className="view">
      <div className="subtabs">
        {SUBS.map((s) => (
          <button
            key={s.key}
            className={sub === s.key ? 'subtab active' : 'subtab'}
            onClick={() => setSub(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'monthly' && <MonthlyTable onOpenOutstanding={openOutstanding} />}
      {sub === 'vendor' && <VendorTable />}
      {sub === 'outstanding' && (
        <OutstandingTable month={outstandingMonth} onMonthChange={setOutstandingMonth} />
      )}
      {sub === 'item' && <ItemTable onOpenTransaction={onOpenTransaction} />}
    </div>
  );
}

function MonthlyTable({ onOpenOutstanding }: { onOpenOutstanding?: (month: string) => void }) {
  const [rows, setRows] = useState<MonthlySummary[]>([]);
  useEffect(() => {
    void (async () => setRows(await window.api.summary.monthly()))();
  }, []);
  const sum = rows.reduce(
    (a, r) => ({
      txnCount: a.txnCount + r.txnCount,
      supply: a.supply + r.supply,
      vat: a.vat + r.vat,
      total: a.total + r.total,
      paid: a.paid + r.paid,
      unpaid: a.unpaid + r.unpaid,
    }),
    { txnCount: 0, supply: 0, vat: 0, total: 0, paid: 0, unpaid: 0 },
  );
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>월</th>
          <th className="num">거래건수</th>
          <th className="num">거래처 수</th>
          <th className="num">공급가액</th>
          <th className="num">부가세</th>
          <th className="num">합계금액</th>
          <th className="num">지급완료</th>
          <th className="num">미지급</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.month}
            className="clickable-row"
            title="이 월의 미수금 보기"
            onClick={() => onOpenOutstanding?.(r.month)}
          >
            <td>{r.month}</td>
            <td className="num">{r.txnCount}</td>
            <td className="num">{r.vendorCount}</td>
            <td className="num">{won(r.supply)}</td>
            <td className="num">{won(r.vat)}</td>
            <td className="num">{won(r.total)}</td>
            <td className="num">{won(r.paid)}</td>
            <td className="num">{won(r.unpaid)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="empty">
              집계할 데이터가 없습니다.
            </td>
          </tr>
        )}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr>
            <td>합계</td>
            <td className="num">{sum.txnCount}</td>
            <td className="num"></td>
            <td className="num">{won(sum.supply)}</td>
            <td className="num">{won(sum.vat)}</td>
            <td className="num">{won(sum.total)}</td>
            <td className="num">{won(sum.paid)}</td>
            <td className="num">{won(sum.unpaid)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function VendorTable() {
  const [rows, setRows] = useState<VendorSummary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [items, setItems] = useState<VendorItemSummary[]>([]);
  useEffect(() => {
    void (async () => setRows(await window.api.summary.byVendor()))();
  }, []);

  async function toggle(vendorId: number) {
    if (openId === vendorId) {
      setOpenId(null);
      setItems([]);
      return;
    }
    setOpenId(vendorId);
    setItems(await window.api.summary.vendorItems(vendorId));
  }

  const sum = rows.reduce(
    (a, r) => ({
      txnCount: a.txnCount + r.txnCount,
      supply: a.supply + r.supply,
      vat: a.vat + r.vat,
      total: a.total + r.total,
      unpaid: a.unpaid + r.unpaid,
    }),
    { txnCount: 0, supply: 0, vat: 0, total: 0, unpaid: 0 },
  );

  return (
    <table className="grid">
      <thead>
        <tr>
          <th>거래처명</th>
          <th className="num">거래건수</th>
          <th className="num">공급가액</th>
          <th className="num">부가세</th>
          <th className="num">합계금액</th>
          <th className="num">미지급금액</th>
          <th>마지막 거래일</th>
          <th>전화번호</th>
          <th>계좌번호</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.vendorId}>
            <tr className="clickable-row" onClick={() => void toggle(r.vendorId)}>
              <td>
                {openId === r.vendorId ? '▾ ' : '▸ '}
                {r.vendorName}
              </td>
              <td className="num">{r.txnCount}</td>
              <td className="num">{won(r.supply)}</td>
              <td className="num">{won(r.vat)}</td>
              <td className="num">{won(r.total)}</td>
              <td className="num">{won(r.unpaid)}</td>
              <td>{nullable(r.lastDate)}</td>
              <td>{nullable(r.phone)}</td>
              <td>{nullable(r.accountNumber)}</td>
            </tr>
            {openId === r.vendorId && (
              <tr className="drill-row">
                <td colSpan={9}>
                  {items.length === 0 ? (
                    <span className="empty">이 거래처의 품목이 없습니다.</span>
                  ) : (
                    <table className="grid inner">
                      <thead>
                        <tr>
                          <th>품목</th>
                          <th>카테고리</th>
                          <th className="num">총수량</th>
                          <th className="num">공급가액</th>
                          <th className="num">부가세</th>
                          <th className="num">합계금액</th>
                          <th className="num">건수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.itemName}>
                            <td>{it.itemName}</td>
                            <td>{nullable(it.categoryName)}</td>
                            <td className="num">{it.totalQty ?? ''}</td>
                            <td className="num">{won(it.supply)}</td>
                            <td className="num">{won(it.vat)}</td>
                            <td className="num">{won(it.total)}</td>
                            <td className="num">{it.lineCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={9} className="empty">
              등록된 거래처가 없습니다.
            </td>
          </tr>
        )}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr>
            <td>합계</td>
            <td className="num">{sum.txnCount}</td>
            <td className="num">{won(sum.supply)}</td>
            <td className="num">{won(sum.vat)}</td>
            <td className="num">{won(sum.total)}</td>
            <td className="num">{won(sum.unpaid)}</td>
            <td colSpan={3}></td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

// 미수금 — 선택 월(기본 전월)의 미지급을 거래처별로. 월 바꾸면 전전달 등도 조회.
// month/onMonthChange는 상위(SummaryView)가 소유 → 월별 요약 클릭으로 특정 월 진입 가능.
function OutstandingTable({ month, onMonthChange }: { month: string; onMonthChange: (m: string) => void }) {
  const [rows, setRows] = useState<OutstandingVendorSummary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [items, setItems] = useState<OutstandingItemSummary[]>([]);

  useEffect(() => {
    setOpenId(null); // 월이 바뀌면 열려있던 드릴다운은 닫음(품목이 월별로 다름)
    setItems([]);
    void (async () => setRows(await window.api.summary.outstandingByVendor(month)))();
  }, [month]);

  // ←/→ 방향키로 월 이동. 입력·선택칸에 포커스가 있으면 무시(그 칸 자체 동작 보존).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onMonthChange(addMonths(month, -1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onMonthChange(addMonths(month, 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [month, onMonthChange]);

  async function toggle(vendorId: number) {
    if (openId === vendorId) {
      setOpenId(null);
      setItems([]);
      return;
    }
    setOpenId(vendorId);
    setItems(await window.api.summary.outstandingVendorItems(vendorId, month));
  }

  const sum = rows.reduce(
    (a, r) => ({ supply: a.supply + r.supply, vat: a.vat + r.vat, unpaid: a.unpaid + r.unpaid }),
    { supply: 0, vat: 0, unpaid: 0 },
  );

  return (
    <>
      <div className="toolbar">
        <label>조회 월</label>
        <button title="이전 달" onClick={() => onMonthChange(addMonths(month, -1))}>
          ◀
        </button>
        <input type="month" value={month} onChange={(e) => onMonthChange(e.target.value)} />
        <button title="다음 달" onClick={() => onMonthChange(addMonths(month, 1))}>
          ▶
        </button>
        <button onClick={() => onMonthChange(prevMonthISO())}>전월</button>
        <span className="auto-due">
          {month} 발행분 중 아직 지급하지 않은 금액(미수금)을 거래처별로 표시합니다. ←/→ 방향키로 월 이동, 행을
          클릭하면 품목이 펼쳐집니다.
        </span>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>거래처명</th>
            <th className="num">미수 건수</th>
            <th className="num">공급가액</th>
            <th className="num">부가세</th>
            <th className="num">미수금</th>
            <th>전화번호</th>
            <th>계좌번호</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.vendorId}>
              <tr className="clickable-row" onClick={() => void toggle(r.vendorId)}>
                <td>
                  {openId === r.vendorId ? '▾ ' : '▸ '}
                  {r.vendorName}
                </td>
                <td className="num">{r.txnCount}</td>
                <td className="num">{won(r.supply)}</td>
                <td className="num">{won(r.vat)}</td>
                <td className="num">{won(r.unpaid)}</td>
                <td>{nullable(r.phone)}</td>
                <td>{nullable(r.accountNumber)}</td>
              </tr>
              {openId === r.vendorId && (
                <tr className="drill-row">
                  <td colSpan={7}>
                    {items.length === 0 ? (
                      <span className="empty">이 거래처의 미수 품목이 없습니다.</span>
                    ) : (
                      <table className="grid inner">
                        <thead>
                          <tr>
                            <th>품목</th>
                            <th>카테고리</th>
                            <th className="num">총수량</th>
                            <th className="num">공급가액</th>
                            <th className="num">부가세</th>
                            <th className="num">미수금</th>
                            <th className="num">건수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.itemName}>
                              <td>{it.itemName}</td>
                              <td>{nullable(it.categoryName)}</td>
                              <td className="num">{it.totalQty ?? ''}</td>
                              <td className="num">{won(it.supply)}</td>
                              <td className="num">{won(it.vat)}</td>
                              <td className="num">{won(it.total)}</td>
                              <td className="num">{it.lineCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="empty">
                {month}에 미수금이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td>합계</td>
              <td className="num"></td>
              <td className="num">{won(sum.supply)}</td>
              <td className="num">{won(sum.vat)}</td>
              <td className="num">{won(sum.unpaid)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </>
  );
}

function ItemTable({ onOpenTransaction }: { onOpenTransaction?: (id: number) => void }) {
  const [rows, setRows] = useState<ItemSummary[]>([]);
  const [openName, setOpenName] = useState<string | null>(null);
  const [txns, setTxns] = useState<ItemTransaction[]>([]);
  useEffect(() => {
    void (async () => setRows(await window.api.summary.byItem()))();
  }, []);

  async function toggle(itemName: string) {
    if (openName === itemName) {
      setOpenName(null);
      setTxns([]);
      return;
    }
    setOpenName(itemName);
    setTxns(await window.api.summary.itemTransactions(itemName));
  }

  return (
    <table className="grid">
      <thead>
        <tr>
          <th>품목명</th>
          <th>카테고리</th>
          <th className="num">총수량</th>
          <th className="num">평균단가</th>
          <th className="num">공급가액</th>
          <th className="num">부가세</th>
          <th className="num">합계금액</th>
          <th>주요 거래처</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.itemName}>
            <tr className="clickable-row" onClick={() => void toggle(r.itemName)}>
              <td>
                {openName === r.itemName ? '▾ ' : '▸ '}
                {r.itemName}
              </td>
              <td>{nullable(r.categoryName)}</td>
              <td className="num">{r.totalQty ?? ''}</td>
              <td className="num">{r.avgUnitPrice == null ? '' : won(r.avgUnitPrice)}</td>
              <td className="num">{won(r.supply)}</td>
              <td className="num">{won(r.vat)}</td>
              <td className="num">{won(r.total)}</td>
              <td>{nullable(r.mainVendor)}</td>
            </tr>
            {openName === r.itemName && (
              <tr className="drill-row">
                <td colSpan={8}>
                  {txns.length === 0 ? (
                    <span className="empty">거래 내역이 없습니다.</span>
                  ) : (
                    <table className="grid inner">
                      <thead>
                        <tr>
                          <th>거래일자</th>
                          <th>거래처</th>
                          <th>규격</th>
                          <th className="num">수량</th>
                          <th className="num">단가</th>
                          <th className="num">공급가액</th>
                          <th className="num">합계</th>
                          <th>결제상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txns.map((t, i) => (
                          <tr
                            key={i}
                            className="clickable-row"
                            title="명세서에서 보기"
                            onClick={() => onOpenTransaction?.(t.transactionId)}
                          >
                            <td>{t.issueDate}</td>
                            <td>{t.vendorName}</td>
                            <td>{nullable(t.spec)}</td>
                            <td className="num">{t.quantity ?? ''}</td>
                            <td className="num">{t.unitPrice == null ? '' : won(t.unitPrice)}</td>
                            <td className="num">{won(t.supply)}</td>
                            <td className="num">{won(t.total)}</td>
                            <td>
                              <StatusBadge status={t.paymentStatus} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="empty">
              집계할 품목이 없습니다.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
