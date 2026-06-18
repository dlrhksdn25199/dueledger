// 단축키 라이브 검증 — Ctrl+F(검색 포커스) / Ctrl+I(가져오기 모달).
// Ctrl+O는 네이티브 저장창을 열어 메인 루프를 막으므로 여기서 다루지 않는다(별도 ESC 처리).
// 사전: DUELEDGER_REMOTE_DEBUG=1 npm run dev 로 앱이 떠 있어야 함.
const targets = await (await fetch('http://localhost:9222/json')).json();
const pageT = targets.find((t) => t.type === 'page');
if (!pageT) throw new Error('page 타깃 없음');
const ws = new WebSocket(pageT.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => pending.set(id, r)); }
async function evalJS(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = [];
const check = (n, c, x = '') => { (c ? pass : fail).push(n); console.log(`${c ? 'PASS' : 'FAIL'}: ${n}${x ? ' -> ' + x : ''}`); };
const goHome = () => evalJS(`Array.from(document.querySelectorAll('.tab')).find(t=>t.textContent.trim()==='홈')?.click(); document.activeElement&&document.activeElement.blur&&document.activeElement.blur(); true`);
const ctrl = (key) => evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',ctrlKey:true,bubbles:true,cancelable:true})); true`);
const activeTab = () => evalJS(`document.querySelector('.tab.active')?.textContent.trim()||''`);

await send('Runtime.enable');
await sleep(300);

// Ctrl+F : 홈 → 명세서 탭 전환 + 검색창 포커스
await goHome(); await sleep(250);
check('시작: 홈 탭', (await activeTab()) === '홈', await activeTab());
await ctrl('f'); await sleep(400);
check('Ctrl+F → 명세서 탭', (await activeTab()) === '명세서', await activeTab());
const focused = await evalJS(`(()=>{const a=document.activeElement;return a?(a.className||'')+'|'+(a.placeholder||''):'(none)';})()`);
check('Ctrl+F → 검색창 포커스', focused.includes('search') || focused.includes('검색'), focused);
// 실제 입력이 검색창으로 들어가는지
await evalJS(`(()=>{const a=document.activeElement;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(a,'테스트검색');a.dispatchEvent(new Event('input',{bubbles:true}));})(); true`);
await sleep(200);
const searchVal = await evalJS(`document.querySelector('input.search')?.value||''`);
check('Ctrl+F 후 검색창에 입력됨', searchVal === '테스트검색', searchVal);
await evalJS(`(()=>{const a=document.querySelector('input.search');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(a,'');a.dispatchEvent(new Event('input',{bubbles:true}));})(); true`);
await sleep(200);

// Ctrl+I : 홈 → 명세서 탭 + 엑셀 가져오기 모달
await goHome(); await sleep(250);
await ctrl('i'); await sleep(400);
check('Ctrl+I → 명세서 탭', (await activeTab()) === '명세서', await activeTab());
const modalTitle = await evalJS(`document.querySelector('.modal.import-modal h2')?.textContent.trim()||''`);
check('Ctrl+I → 엑셀 가져오기 모달 열림', modalTitle === '엑셀 가져오기', modalTitle);
// 모달 닫기(취소)
await evalJS(`Array.from(document.querySelectorAll('.modal.import-modal button')).find(b=>b.textContent.trim()==='취소')?.click(); true`);
await sleep(300);
check('가져오기 모달 닫힘', (await evalJS(`!document.querySelector('.modal.import-modal')`)) === true);

console.log(`\n=== RESULT: ${pass.length} passed, ${fail.length} failed ===`);
if (fail.length) console.log('FAILED: ' + fail.join(' | '));
ws.close();
process.exit(fail.length ? 1 : 0);
