import { useEffect, useMemo, useState } from 'react';
import type { TransactionSummary } from '../../../shared/api';
import { groupPaymentsByDate } from '../../../domain/paymentSchedule';
import { won, todayISO } from '../format';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function CalendarView() {
  const [summaries, setSummaries] = useState<TransactionSummary[]>([]);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const today = todayISO();

  useEffect(() => {
    void (async () => setSummaries(await window.api.transaction.listSummaries()))();
  }, []);

  const byDate = useMemo(() => groupPaymentsByDate(summaries), [summaries]);

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  }

  // 달력 셀: 첫 주 앞 공백 + 1..말일
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

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
          return (
            <div key={idx} className={`cal-cell${isToday ? ' today' : ''}`}>
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
      <p className="hint">결제일 기준. 빨간 칸 = 미지급 포함, 회색 칸 = 전부 지급완료.</p>
    </div>
  );
}
