// 임포트 라이브 검증 — 실행 중 앱에서 window.api.import.preview/commit를 합성 fixture로 호출.
// 파일 선택 대화상자(openDialog)는 네이티브라 CDP로 못 누르므로 경로를 직접 넘겨 파이프라인을 검증한다.
// 사전: npm run rebuild:electron && DUELEDGER_REMOTE_DEBUG=1 npm run dev (빈 DB 권장)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const SAMPLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'sample-ledger.xlsx').replace(/\\/g, '/');

const targets = await (await fetch('http://localhost:9222/json')).json();
const pageT = targets.find((t) => t.type === 'page');
if (!pageT) throw new Error('page 타깃 없음 — DUELEDGER_REMOTE_DEBUG=1 로 앱이 떠 있는지 확인');
const ws = new WebSocket(pageT.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => pending.set(id, r)); }
async function evalJS(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
const pass = [], fail = [];
const check = (name, cond, extra = '') => { (cond ? pass : fail).push(name); console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${extra ? ' -> ' + extra : ''}`); };

// 0) 시작 상태 — 명세서 0
const before = await evalJS(`window.api.ledger.list().then(r=>r.length)`);
check('시작 시 원장 비어있음', before === 0, `rows=${before}`);

// 1) preview — 쓰기 없이 집계
const pv = await evalJS(`window.api.import.preview(${JSON.stringify(SAMPLE)})`);
check('preview 신규 품목 6', pv?.newItems === 6, JSON.stringify({ st: pv?.newStatements, items: pv?.newItems, dup: pv?.duplicateItems }));
check('preview 신규 카테고리에 원재료 포함', pv?.newCategories?.includes('원재료'), (pv?.newCategories || []).join(','));
const afterPreview = await evalJS(`window.api.ledger.list().then(r=>r.length)`);
check('preview는 DB를 건드리지 않음', afterPreview === 0, `rows=${afterPreview}`);

// 2) commit — 적재
const c1 = await evalJS(`window.api.import.commit(${JSON.stringify(SAMPLE)})`);
check('commit 후 품목 6 적재', c1?.newItems === 6, JSON.stringify({ st: c1?.newStatements, items: c1?.newItems }));
const ledgerRows = await evalJS(`window.api.ledger.list().then(r=>r.length)`);
check('원장에 6줄 보임', ledgerRows === 6, `rows=${ledgerRows}`);

// 3) 결제일 = 거래일자 (수동지정), 거래처/카테고리 자동 생성 확인
const sample = await evalJS(`window.api.ledger.list({sort:{column:'issueDate',direction:'asc'}}).then(r=>({first:r[0], dueIsIssue: r.every(x=>x.dueDate===x.issueDate)}))`);
check('모든 결제일 = 거래일자', sample?.dueIsIssue === true);
const vendors = await evalJS(`window.api.vendor.list().then(r=>r.length)`);
const cats = await evalJS(`window.api.category.list().then(r=>r.map(c=>c.name))`);
check('거래처 자동 생성됨(3)', vendors === 3, `vendors=${vendors}`);
check('카테고리에 원재료/부자재 자동 생성', cats.includes('원재료') && cats.includes('부자재'), cats.join(','));

// 4) 재임포트 — 전부 중복
const c2 = await evalJS(`window.api.import.commit(${JSON.stringify(SAMPLE)})`);
check('재임포트는 전부 중복(신규 0)', c2?.newItems === 0 && c2?.duplicateItems === 6, JSON.stringify({ items: c2?.newItems, dup: c2?.duplicateItems }));
const ledgerRows2 = await evalJS(`window.api.ledger.list().then(r=>r.length)`);
check('재임포트 후에도 6줄 (2배 안 됨)', ledgerRows2 === 6, `rows=${ledgerRows2}`);

console.log(`\n=== RESULT: ${pass.length} passed, ${fail.length} failed ===`);
if (fail.length) console.log('FAILED: ' + fail.join(' | '));
ws.close();
process.exit(fail.length ? 1 : 0);
