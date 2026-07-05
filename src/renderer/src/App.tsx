import { useEffect, useRef, useState } from 'react';
import { HomeView } from './views/HomeView';
import { LedgerView } from './views/LedgerView';
import { CalendarView } from './views/CalendarView';
import { SummaryView } from './views/SummaryView';
import { ManageView } from './views/ManageView';

type Tab = 'home' | 'ledger' | 'calendar' | 'summary' | 'manage';

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: '홈' },
  { key: 'ledger', label: '명세서' },
  { key: 'calendar', label: '달력' },
  { key: 'summary', label: '요약' },
  { key: 'manage', label: '거래처·카테고리' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const lastWheel = useRef(0);
  // 요약 등에서 명세서로 이동: 특정 거래 하이라이트, 특정 월 필터, 또는 단축키 액션.
  const [ledgerNav, setLedgerNav] = useState<{
    highlightTxn?: number;
    month?: string;
    action?: 'search' | 'import' | 'export';
  } | null>(null);
  function openLedgerTxn(transactionId: number) {
    setLedgerNav({ highlightTxn: transactionId });
    setTab('ledger');
  }

  const step = (dir: 1 | -1) =>
    setTab((prev) => {
      const i = TABS.findIndex((t) => t.key === prev);
      return TABS[(i + dir + TABS.length) % TABS.length].key;
    });

  // 키보드: Ctrl+1~5 = 해당 탭, Ctrl+Tab = 다음 탭(순환),
  // Ctrl+F = 명세서 검색, Ctrl+I = 엑셀 가져오기, Ctrl+O = 엑셀 내보내기(전부 명세서 탭).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        step(1);
        return;
      }
      const action =
        e.key.toLowerCase() === 'f'
          ? 'search'
          : e.key.toLowerCase() === 'i'
            ? 'import'
            : e.key.toLowerCase() === 'o'
              ? 'export'
              : null;
      if (action) {
        e.preventDefault();
        setLedgerNav({ action });
        setTab('ledger');
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= TABS.length) {
        e.preventDefault();
        setTab(TABS[n - 1].key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ctrl+휠: 탭 전환(기본 줌 동작 막음). 한 번 스크롤에 한 탭만(250ms 스로틀).
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel.current < 250) return;
      lastWheel.current = now;
      step(e.deltaY > 0 ? 1 : -1);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>DueLedger</h1>
        <nav className="tabs">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
              title={`Ctrl+${i + 1}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {tab === 'home' && <HomeView onOpenTransaction={openLedgerTxn} />}
        {tab === 'ledger' && (
          <LedgerView nav={ledgerNav} onNavConsumed={() => setLedgerNav(null)} />
        )}
        {tab === 'calendar' && <CalendarView onOpenTransaction={openLedgerTxn} />}
        {tab === 'summary' && <SummaryView onOpenTransaction={openLedgerTxn} />}
        {tab === 'manage' && <ManageView />}
      </main>
    </div>
  );
}
