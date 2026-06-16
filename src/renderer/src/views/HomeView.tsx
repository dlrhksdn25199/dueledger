import { useEffect, useState } from 'react';
import type { TransactionSummary } from '../../../shared/api';
import { classifyPayments } from '../../../domain/paymentSchedule';
import { won, todayISO, ddayLabel } from '../format';
import { StatusBadge } from '../status';

export function HomeView() {
  const [summaries, setSummaries] = useState<TransactionSummary[]>([]);
  const [recent, setRecent] = useState<TransactionSummary[]>([]);
  const today = todayISO();

  useEffect(() => {
    void (async () => {
      setSummaries(await window.api.transaction.listSummaries());
      setRecent(await window.api.transaction.listRecent(5));
    })();
  }, []);

  const c = classifyPayments(summaries, today);
  // 챙겨야 할 것 = 연체 + 임박, 결제일 빠른 순
  const attention = [...c.overdue.items, ...c.dueSoon.items].sort((a, b) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? ''),
  );

  return (
    <div className="view">
      <section className="cards">
        <div className="card danger">
          <div className="card-label">연체</div>
          <div className="card-count">{c.overdue.count}건</div>
          <div className="card-amount">{won(c.overdue.total)}원</div>
        </div>
        <div className="card warn">
          <div className="card-label">임박 (7일 이내)</div>
          <div className="card-count">{c.dueSoon.count}건</div>
          <div className="card-amount">{won(c.dueSoon.total)}원</div>
        </div>
        <div className="card">
          <div className="card-label">예정</div>
          <div className="card-count">{c.upcoming.count}건</div>
          <div className="card-amount">{won(c.upcoming.total)}원</div>
        </div>
        <div className="card total">
          <div className="card-label">총 미지급</div>
          <div className="card-count">&nbsp;</div>
          <div className="card-amount">{won(c.totalUnpaid)}원</div>
        </div>
      </section>

      <section>
        <h2 className="section-title">챙길 결제 (연체 · 임박)</h2>
        <table className="grid">
          <thead>
            <tr>
              <th>결제일</th>
              <th>D-day</th>
              <th>거래처</th>
              <th className="num">금액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {attention.map((s) => (
              <tr key={s.id} className={s.dueDate && s.dueDate < today ? 'overdue-row' : ''}>
                <td>{s.dueDate}</td>
                <td>{s.dueDate ? ddayLabel(s.dueDate, today) : ''}</td>
                <td>{s.vendorName}</td>
                <td className="num">{won(s.total)}</td>
                <td>
                  <StatusBadge status={s.paymentStatus} />
                </td>
              </tr>
            ))}
            {attention.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  연체·임박 결제가 없습니다. 👍
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {c.undated.count > 0 && (
          <p className="hint">결제일 미정 {c.undated.count}건 ({won(c.undated.total)}원) — 거래처 결제조건을 설정하면 결제일이 계산됩니다.</p>
        )}
      </section>

      <section>
        <h2 className="section-title">최근 입력·수정</h2>
        <table className="grid">
          <thead>
            <tr>
              <th>거래일자</th>
              <th>거래처</th>
              <th className="num">금액</th>
              <th>결제일</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.id}>
                <td>{s.issueDate}</td>
                <td>{s.vendorName}</td>
                <td className="num">{won(s.total)}</td>
                <td>{s.dueDate ?? '—'}</td>
                <td>
                  <StatusBadge status={s.paymentStatus} />
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  아직 입력한 명세서가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
