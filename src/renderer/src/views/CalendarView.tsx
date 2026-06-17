import { useEffect, useMemo, useState } from 'react';
import type { LedgerRow, TransactionSummary } from '../../../shared/api';
import { groupPaymentsByDate } from '../../../domain/paymentSchedule';
import { won, nullable, todayISO } from '../format';
import { StatusBadge } from '../status';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function CalendarView({ onOpenTransaction }: { onOpenTransaction?: (id: number) => void } = {}) {
  const [summaries, setSummaries] = useState<TransactionSummary[]>([]);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const today = todayISO();

  // 선택한 날짜 + 그 날 결제할 품목 줄 상세(거래처·품목·금액·상태).
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<LedgerRow[]>([]);

  useEffect(() => {
    void (async () => setSummaries(await window.api.transaction.listSummaries()))();
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setDetail([]);
      return;
    }
    void (async () => {
      // 결제일 = 선택 날짜인 품목 줄. 거래처순 정렬.
      setDetail(
        await window.api.ledger.list({
          filter: { dueDateFrom: selectedDate, dueDateTo: selectedDate },
          sort: { column: 'vendorName', direction: 'asc' },
        }),
      );
    })();
  }, [selectedDate, summaries]);

  const byDate = useMemo(() => groupPaymentsByDate(summaries), [summaries]);

  function prevMonth() {
    setSelectedDate(null);
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    setSelectedDate(null);
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  }

  // Ctrl+←/→ 로 월 이동.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevMonth(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nextMonth(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [year, month]); // 월 바뀔 때마다 최신 prev/next로 재바인딩

  // 달력 셀: 첫 주 앞 공백 + 1..말일
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const detailTotal = detail.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="view">
      <div className="cal-header">
        <button onClick={prevMonth}>‹ 이전</button>
        <h2>
          {year}년 {month}월
        </h2>
        <button onClick={nextMonth}>다음 ›</button>
      </div>

      <div className="calendar">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>
            {w}
          </div>
        ))}
        {cells.map((d, idx) => {
          if (d === null) return <div key={idx} className="cal-cell empty-cell" />;
          const iso = `${year}-${pad2(month)}-${pad2(d)}`;
          const cell = byDate[iso];
          const isToday = iso === today;
          const clickable = !!cell;
          return (
            <div
              key={idx}
              className={`cal-cell${isToday ? ' today' : ''}${clickable ? ' clickable' : ''}${
                iso === selectedDate ? ' selected' : ''
              }`}
              onClick={clickable ? () => setSelectedDate(iso) : undefined}
            >
              <div className="cal-day">{d}</div>
              {cell && (
                <div className={`cal-pay${cell.unpaidCount > 0 ? ' unpaid' : ' paid'}`}>
                  <div className="cal-amount">{won(cell.total)}</div>
                  <div className="cal-cnt">
                    {cell.count}건{cell.unpaidCount > 0 ? ` · 미지급 ${cell.unpaidCount}` : ''}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDate ? (
        <div className="cal-detail">
          <div className="cal-detail-head">
            <h3>{selectedDate} 결제 상세</h3>
            <button onClick={() => setSelectedDate(null)}>닫기</button>
          </div>
          {detail.length === 0 ? (
            <p className="empty">이 날짜에 결제할 항목이 없습니다.</p>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th>거래처</th>
                  <th>품목</th>
                  <th>규격</th>
                  <th className="num">수량</th>
                  <th className="num">합계</th>
                  <th>결제상태</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((r) => (
                  <tr
                    key={r.itemId}
                    className="clickable-row"
                    title="명세서에서 보기"
                    onClick={() => onOpenTransaction?.(r.transactionId)}
                  >
                    <td>{r.vendorName}</td>
                    <td>{r.itemName}</td>
                    <td>{nullable(r.spec)}</td>
                    <td className="num">{r.quantity ?? ''}</td>
                    <td className="num">{won(r.total)}</td>
                    <td>
                      <StatusBadge status={r.paymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="num">
                    합계
                  </td>
                  <td className="num">{won(detailTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      ) : (
        <p className="hint">결제일 기준. 빨간 칸 = 미지급 포함, 회색 칸 = 전부 지급완료. 날짜를 클릭하면 상세가 보입니다.</p>
      )}
    </div>
  );
}
