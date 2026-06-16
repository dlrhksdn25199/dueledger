// CDP UI 스모크 — 실행 중인 앱을 띄워 핵심 흐름(시드·거래처·명세서·금액/결제일 계산·정렬·삭제가드)을 클릭/입력으로 검증.
// 사전: 깨끗한 프로필로 앱 실행 →  npm run rebuild:electron && DUELEDGER_REMOTE_DEBUG=1 npm run dev
// 그다음:  node scripts/cdp-smoke.mjs   (스크린샷: /tmp/dl-shots, 의존성 없음 — Node 내장 fetch/WebSocket)
import { writeFileSync, mkdirSync } from 'node:fs';

const SHOT = '/tmp/dl-shots';
mkdirSync(SHOT, { recursive: true });

const targets = await (await fetch('http://localhost:9222/json')).json();
const pageT = targets.find((t) => t.type === 'page');
if (!pageT) throw new Error('page 타깃 없음 — DUELEDGER_REMOTE_DEBUG=1 로 앱이 떠 있는지 확인');
const ws = new WebSocket(pageT.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
async function evalJS(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.error) throw new Error(JSON.stringify(r.error));
  if (r.result?.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) writeFileSync(`${SHOT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pass = [], fail = [];
function check(name, cond, extra = '') {
  (cond ? pass : fail).push(name);
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${extra ? ' -> ' + extra : ''}`);
}

await send('Runtime.enable');
await send('Page.enable');

await evalJS(`
  window.__t = {
    setInput(el,val){const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;const s=Object.getOwnPropertyDescriptor(p.prototype,'value').set;s.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));},
    setSelect(el,val){const s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;s.call(el,val);el.dispatchEvent(new Event('change',{bubbles:true}));},
    selByText(el,text){const o=Array.from(el.options).find(o=>o.textContent.trim()===text);if(o){this.setSelect(el,o.value);return true;}return false;},
    clickText(sel,text){const e=Array.from(document.querySelectorAll(sel)).find(e=>{const t=e.textContent.trim();return t===text||t.startsWith(text);});if(e){e.click();return true;}return false;},
    rows(sel){return Array.from(document.querySelectorAll(sel+' tbody tr')).map(tr=>Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim()));},
  };
  window.confirm=()=>true; window.alert=(m)=>{window.__lastAlert=m;};
  true;
`);

await sleep(400);
await shot('01-initial');

// 1) 카테고리 시드
await evalJS(`__t.clickText('.tab','카테고리')`);
await sleep(300);
const cats = (await evalJS(`__t.rows('table.grid')`)).map((r) => r[0]);
check('카테고리 시드 5종', ['식자재', '포장재', '소모품', '위생용품', '기타'].every((c) => cats.includes(c)), cats.join(','));
await shot('02-categories');

// 2) 거래처 net-30 생성
await evalJS(`__t.clickText('.tab','거래처')`);
await sleep(300);
await evalJS(`__t.setInput(document.querySelector('input[placeholder="거래처명"]'),'가나상회'); __t.setSelect(document.querySelector('.form-card select'),'net'); true`);
await sleep(250);
await evalJS(`__t.setInput(document.querySelector('.form-card input[type=number]'),'30'); true`);
await sleep(150);
await evalJS(`__t.clickText('.form-card button','추가')`);
await sleep(500);
const vendors = (await evalJS(`__t.rows('table.grid')`)).map((r) => r[0]);
check('거래처 생성(가나상회)', vendors.includes('가나상회'), vendors.join(','));
await shot('03-vendor');

// 3) 새 명세서 (공급가액 12345 과세, 카테고리 식자재) — 금액/결제일 계산 검증
await evalJS(`__t.clickText('.tab','명세서')`);
await sleep(300);
await evalJS(`__t.clickText('.toolbar button','+ 새 명세서')`);
await sleep(400);
await evalJS(`__t.selByText(document.querySelector('.modal select'),'가나상회'); true`);
await evalJS(`__t.setInput(document.querySelector('.modal input[type=date]'),'2026-06-16'); true`);
await evalJS(`
  const sels=document.querySelectorAll('.items tbody tr:first-child select');
  __t.selByText(sels[0],'식자재');
  const ins=document.querySelectorAll('.items tbody tr:first-child td input');
  __t.setInput(ins[0],'간장'); __t.setInput(ins[4],'12345'); true
`);
await sleep(300);
const preview = await evalJS(`Array.from(document.querySelectorAll('.items tbody tr:first-child td.num')).map(t=>t.textContent.trim())`);
check('미리보기 부가세 1,235 (0.5 올림)', preview[0] === '1,235', preview.join(' / '));
check('미리보기 합계 13,580', preview[1] === '13,580', preview.join(' / '));
await shot('04-form');
await evalJS(`__t.clickText('.modal button','저장')`);
await sleep(600);

// 기존 데이터가 있어도 견디게 — 방금 만든 행을 내용으로 탐색
const ledger = await evalJS(`__t.rows('table.grid.ledger')`);
const row = ledger.find((r) => r[1] === '가나상회' && r[3] === '12,345');
check('명세서 행 생성(가나상회/12,345)', !!row, `rows=${ledger.length}`);
if (row) {
  check('거래일자 2026-06-16', row[0] === '2026-06-16', row[0]);
  check('카테고리 식자재', row[2] === '식자재', row[2]);
  check('합계 13,580', row[4] === '13,580', row[4]);
  check('결제일 2026-07-16 (net-30)', row[6] === '2026-07-16', row[6]);
  check('부가세 1,235', row[10] === '1,235', row[10]);
}
await shot('05-ledger');

// 4) 정렬 클릭(공급가액) — 에러 없이 동작
await evalJS(`__t.clickText('th.sortable','공급가액')`);
await sleep(300);
check('정렬 클릭 후 행 유지', (await evalJS(`__t.rows('table.grid.ledger')`)).length >= 1);

// 5) 카테고리 사용 중 삭제 차단 (P0 #4)
await evalJS(`__t.clickText('.tab','카테고리'); window.__lastAlert=null; true`);
await sleep(300);
await evalJS(`
  const tr=Array.from(document.querySelectorAll('table.grid tbody tr')).find(t=>t.querySelector('td')?.textContent.trim()==='식자재');
  Array.from(tr.querySelectorAll('button')).find(b=>b.textContent.trim()==='삭제').click(); true
`);
await sleep(500);
const alertMsg = await evalJS(`window.__lastAlert`);
check('사용 중 카테고리 삭제 차단 알림', !!alertMsg && alertMsg.includes('사용 중'), alertMsg || '(no alert)');
await shot('06-category-guard');

// 6) 홈 대시보드 (A) — 카드 + 상태 배지
await evalJS(`__t.clickText('.tab','홈')`);
await sleep(400);
const cards = await evalJS(`
  Object.fromEntries(Array.from(document.querySelectorAll('.card')).map(c=>[
    c.querySelector('.card-label').textContent.trim(),
    { count: c.querySelector('.card-count').textContent.trim(), amount: c.querySelector('.card-amount').textContent.trim() }
  ]))
`);
check('홈 예정 카드 1건', cards['예정']?.count === '1건', JSON.stringify(cards['예정']));
check('홈 총 미지급 13,580원', (cards['총 미지급']?.amount || '').includes('13,580'), cards['총 미지급']?.amount);
const homeBadge = await evalJS(`document.querySelector('.badge')?.textContent.trim() || ''`);
check('홈 상태 배지(미지급)', homeBadge === '미지급' || homeBadge === '', homeBadge); // attention 비어있을 수도
await shot('07-home');

// 7) 배지 색상 (B) — 명세서 표의 결제상태 배지
await evalJS(`__t.clickText('.tab','명세서')`);
await sleep(400);
const ledgerBadge = await evalJS(`document.querySelector('table.grid.ledger .badge.unpaid')?.textContent.trim() || ''`);
check('명세서 미지급 배지', ledgerBadge === '미지급', ledgerBadge);

// 8) 캘린더 (E) — 7월로 이동, 결제일(7/16) 칸에 금액 표시
await evalJS(`__t.clickText('.tab','달력')`);
await sleep(400);
await evalJS(`__t.clickText('.cal-header button','다음')`); // 6월 → 7월
await sleep(300);
const calAmounts = await evalJS(`Array.from(document.querySelectorAll('.cal-amount')).map(e=>e.textContent.trim())`);
check('캘린더 7월에 결제(13,580) 표시', calAmounts.includes('13,580'), calAmounts.join(','));
await shot('08-calendar');

// 9) 인라인 거래처/카테고리 생성 + 수동 결제일
await evalJS(`__t.clickText('.tab','명세서')`);
await sleep(300);
await evalJS(`__t.clickText('.toolbar button','+ 새 명세서')`);
await sleep(400);
// 인라인 거래처
await evalJS(`__t.clickText('.modal button','+ 새 거래처')`);
await sleep(200);
await evalJS(`__t.setInput(document.querySelector('.modal input[placeholder="새 거래처명"]'),'직접거래처'); true`);
await evalJS(`__t.clickText('.modal button','추가')`);
await sleep(400);
const vSel = await evalJS(`(()=>{const s=document.querySelector('.modal select');return s.options[s.selectedIndex].textContent.trim();})()`);
check('인라인 거래처 생성·자동선택', vSel === '직접거래처', vSel);
// 인라인 카테고리
await evalJS(`__t.clickText('.modal button','+ 새 카테고리')`);
await sleep(200);
await evalJS(`__t.setInput(document.querySelector('.modal input[placeholder="새 카테고리명"]'),'신규분류'); true`);
await evalJS(`__t.clickText('.modal button','추가')`);
await sleep(400);
const catOpts = await evalJS(`Array.from(document.querySelectorAll('.items tbody tr:first-child select option')).map(o=>o.textContent.trim())`);
check('인라인 카테고리 생성(드롭다운 반영)', catOpts.includes('신규분류'), catOpts.join(','));
// 수동 결제일 지정
await evalJS(`document.querySelector('.modal input[type=checkbox]').click(); true`);
await sleep(300);
await evalJS(`(()=>{const ds=document.querySelectorAll('.modal input[type=date]'); __t.setInput(ds[ds.length-1],'2026-08-01');})(); true`);
// 발행일도 명시
await evalJS(`__t.setInput(document.querySelectorAll('.modal input[type=date]')[0],'2026-06-16'); true`);
// 품목
await evalJS(`
  __t.selByText(document.querySelectorAll('.items tbody tr:first-child select')[0],'신규분류');
  const ins=document.querySelectorAll('.items tbody tr:first-child td input');
  __t.setInput(ins[0],'특별품목'); __t.setInput(ins[4],'20000'); true
`);
await sleep(200);
await shot('09-form-manual');
await evalJS(`__t.clickText('.modal button','저장')`);
await sleep(600);
const led2 = await evalJS(`__t.rows('table.grid.ledger')`);
const row2 = led2.find((r) => r[1] === '직접거래처' && r[3] === '20,000');
check('수동 결제일 명세서 생성', !!row2, `rows=${led2.length}`);
if (row2) {
  check('수동 결제일 2026-08-01 저장', row2[6] === '2026-08-01', row2[6]);
  check('인라인 카테고리(신규분류) 적용', row2[2] === '신규분류', row2[2]);
}
await shot('10-ledger2');

// 10) 홈 최근 입력·수정에 방금 것 표시
await evalJS(`__t.clickText('.tab','홈')`);
await sleep(400);
const recentHas = await evalJS(`(()=>{const t=document.querySelectorAll('table.grid');const last=t[t.length-1];return Array.from(last.querySelectorAll('tbody tr td')).some(td=>td.textContent.trim()==='직접거래처');})()`);
check('홈 최근 입력에 직접거래처 표시', recentHas === true);
await shot('11-home-recent');

console.log(`\n=== RESULT: ${pass.length} passed, ${fail.length} failed ===`);
if (fail.length) console.log('FAILED: ' + fail.join(' | '));
ws.close();
process.exit(fail.length ? 1 : 0);
