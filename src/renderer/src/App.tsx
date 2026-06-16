import { useState } from 'react';
import { HomeView } from './views/HomeView';
import { LedgerView } from './views/LedgerView';
import { CalendarView } from './views/CalendarView';
import { VendorView } from './views/VendorView';
import { CategoryView } from './views/CategoryView';

type Tab = 'home' | 'ledger' | 'calendar' | 'vendor' | 'category';

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: '홈' },
  { key: 'ledger', label: '명세서' },
  { key: 'calendar', label: '달력' },
  { key: 'vendor', label: '거래처' },
  { key: 'category', label: '카테고리' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div className="app">
      <header className="topbar">
        <h1>거래명세서 정리 도구</h1>
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
        {tab === 'vendor' && <VendorView />}
        {tab === 'category' && <CategoryView />}
      </main>
    </div>
  );
}
