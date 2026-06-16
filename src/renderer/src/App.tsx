import { useState } from 'react';
import { LedgerView } from './views/LedgerView';
import { VendorView } from './views/VendorView';
import { CategoryView } from './views/CategoryView';

type Tab = 'ledger' | 'vendor' | 'category';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ledger', label: '명세서' },
  { key: 'vendor', label: '거래처' },
  { key: 'category', label: '카테고리' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('ledger');

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
        {tab === 'ledger' && <LedgerView />}
        {tab === 'vendor' && <VendorView />}
        {tab === 'category' && <CategoryView />}
      </main>
    </div>
  );
}
