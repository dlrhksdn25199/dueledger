import { useState } from 'react';
import { HomeView } from './views/HomeView';
import { LedgerView } from './views/LedgerView';
import { CalendarView } from './views/CalendarView';
import { ManageView } from './views/ManageView';

type Tab = 'home' | 'ledger' | 'calendar' | 'manage';

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: '홈' },
  { key: 'ledger', label: '명세서' },
  { key: 'calendar', label: '달력' },
  { key: 'manage', label: '거래처·카테고리' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div className="app">
      <header className="topbar">
        <h1>DueLedger</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {tab === 'home' && <HomeView />}
        {tab === 'ledger' && <LedgerView />}
        {tab === 'calendar' && <CalendarView />}
        {tab === 'manage' && <ManageView />}
      </main>
    </div>
  );
}
