import { Fragment, useEffect, useState } from 'react';
import type {
  MonthlySummary,
  VendorSummary,
  ItemSummary,
  VendorItemSummary,
} from '../../../shared/api';
import { won, nullable } from '../format';

type Sub = 'monthly' | 'vendor' | 'item';

const SUBS: { key: Sub; label: string }[] = [
  { key: 'monthly', label: '월별 요약' },
  { key: 'vendor', label: '거래처별 요약' },
  { key: 'item', label: '품목별 요약' },
];

export function SummaryView() {
  const [sub, setSub] = useState<Sub>('monthly');
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
      {sub === 'monthly' && <MonthlyTable />}
      {sub === 'vendor' && <VendorTable />}
      {sub === 'item' && <ItemTable />}
    </div>
  );
}

function MonthlyTable() {
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
          <tr key={r.month}>
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

function ItemTable() {
  const [rows, setRows] = useState<ItemSummary[]>([]);
  useEffect(() => {
    void (async () => setRows(await window.api.summary.byItem()))();
  }, []);
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
          <tr key={r.itemName}>
            <td>{r.itemName}</td>
            <td>{nullable(r.categoryName)}</td>
            <td className="num">{r.totalQty ?? ''}</td>
            <td className="num">{r.avgUnitPrice == null ? '' : won(r.avgUnitPrice)}</td>
            <td className="num">{won(r.supply)}</td>
            <td className="num">{won(r.vat)}</td>
            <td className="num">{won(r.total)}</td>
            <td>{nullable(r.mainVendor)}</td>
          </tr>
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
