import { useEffect, useState } from 'react';
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

  // 키보드: Ctrl+1~5 = 해당 탭, Ctrl+Tab = 다음 탭(순환).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        setTab((prev) => {
          const i = TABS.findIndex((t) => t.key === prev);
          return TABS[(i + 1) % TABS.length].key;
        });
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
              <span className="tab-num">{i + 1}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {tab === 'home' && <HomeView />}
        {tab === 'ledger' && <LedgerView />}
        {tab === 'calendar' && <CalendarView />}
        {tab === 'summary' && <SummaryView />}
        {tab === 'manage' && <ManageView />}
      </main>
    </div>
  );
}
