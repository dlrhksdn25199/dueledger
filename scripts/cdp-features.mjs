// CDP 기능 검증 — 새 선택기능 4종을 실행 중인 Electron 앱의 window.api(=IPC→repository→SQLite)로 직접 검증.
// 사전: npm run rebuild:electron && DUELEDGER_REMOTE_DEBUG=1 npm run dev  →  node scripts/cdp-features.mjs
// DOM 클릭이 아니라 실제 메인프로세스 저장소 경로를 태워 better-sqlite3 + 새 IPC 핸들러를 라이브로 확인.
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
  if (r.result?.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.result.result || r.result.exceptionDetails));
  return r.result?.result?.value;
}
await send('Runtime.enable');

// 유일 접미사 — 기존 데이터와 충돌 안 나게.
const tag = 't' + Date.now();

// 한 번의 async IIFE로 전 시나리오 실행 → 결과 배열 반환.
const results = await evalJS(`(async () => {
  const api = window.api;
  const out = [];
  const ok = (name, cond, extra='') => out.push({ name, pass: !!cond, extra: String(extra) });

  // ── 기능①: 편집 가능 세율(taxRate) ──
  const rate0 = await api.settings.getTaxRate();
  ok('세율 기본 0.1', rate0 === 0.1, rate0);
  await api.settings.setTaxRate(0.15);
  ok('세율 저장→조회 0.15', (await api.settings.getTaxRate()) === 0.15);

  const v = await api.vendor.create({ name: '세율거래처_${tag}', paymentTerms: { type: 'net', value: 30 } });
  const mkTxn = () => api.transaction.create({
    vendorId: v.id, issueDate: '2026-06-16', paymentStatus: '미지급', memo: null,
    items: [{ categoryId: null, name: '품목', spec: null, quantity: null, unitPrice: null, supplyAmount: 10000, taxType: '과세' }],
  });
  const t15 = await mkTxn();
  ok('세율 0.15 적용 vat=1500', t15.items[0].vat === 1500, t15.items[0].vat);

  await api.settings.setTaxRate(0.1); // 원복
  const t15after = await api.transaction.get(t15.id);
  ok('기존 명세서 vat 불변(비소급)', t15after.items[0].vat === 1500, t15after.items[0].vat);
  const t10 = await mkTxn();
  ok('세율 원복 후 새 vat=1000', t10.items[0].vat === 1000, t10.items[0].vat);

  // ── 기능②: 거래처 결제조건 변경 시 dueDate 재계산 ──
  ok('자동 dueDate net-30 = 2026-07-16', t10.dueDate === '2026-07-16', t10.dueDate);
  const manual = await api.transaction.create({
    vendorId: v.id, issueDate: '2026-06-16', paymentStatus: '미지급', memo: null,
    items: [{ categoryId: null, name: '수동', spec: null, quantity: null, unitPrice: null, supplyAmount: 5000, taxType: '면세' }],
    dueDateOverridden: true, dueDate: '2099-01-01',
  });
  // 결제조건 변경 → vendor:update 핸들러가 재계산 훅 호출
  await api.vendor.update(v.id, { name: v.name, paymentTerms: { type: 'dayOfMonth', value: 10 } });
  const t10re = await api.transaction.get(t10.id);
  ok('조건 변경 후 자동 dueDate 재계산 = 2026-07-10', t10re.dueDate === '2026-07-10', t10re.dueDate);
  const manualRe = await api.transaction.get(manual.id);
  ok('수동지정 명세서는 유지 = 2099-01-01', manualRe.dueDate === '2099-01-01', manualRe.dueDate);
  // 조건 제거 → 자동 dueDate null
  await api.vendor.update(v.id, { name: v.name, paymentTerms: null });
  ok('조건 제거 후 자동 dueDate = null', (await api.transaction.get(t10.id)).dueDate === null);

  // ── 기능③: CategoryInUseError 건수 구조화 IPC 전달 ──
  const cat = await api.category.create('세율카테고리_${tag}');
  await api.transaction.create({
    vendorId: v.id, issueDate: '2026-06-16', paymentStatus: '미지급', memo: null,
    items: [{ categoryId: cat.id, name: 'x', spec: null, quantity: null, unitPrice: null, supplyAmount: 1000, taxType: '과세' }],
  });
  const rmBlocked = await api.category.remove(cat.id);
  ok('사용 중 삭제 → 구조화 {ok:false,itemCount}', rmBlocked.ok === false && rmBlocked.itemCount === 1, JSON.stringify(rmBlocked));
  const unusedCat = await api.category.create('빈카테고리_${tag}');
  const rmOk = await api.category.remove(unusedCat.id);
  ok('미사용 삭제 → {ok:true}', rmOk.ok === true, JSON.stringify(rmOk));

  return out;
})()`);

const pass = results.filter((r) => r.pass);
const fail = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.name}${r.extra ? ' -> ' + r.extra : ''}`);
console.log(`\n${pass.length}/${results.length} passed` + (fail.length ? `  (FAIL: ${fail.map((f) => f.name).join(', ')})` : ''));
ws.close();
process.exit(fail.length ? 1 : 0);
