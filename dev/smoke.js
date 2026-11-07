// Дымовой тест движка в Node (имитация браузерного окружения).
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, getElementById: () => ({ textContent: '', innerHTML: '', disabled: false, classList: { add() {}, toggle() {}, remove() {} } }) };
globalThis.CSS = { escape: s => s.replace(/[^\w-]/g, c => '\\' + c) };
globalThis.localStorage = { getItem: () => null, setItem() {} };

require('../providers.js');
const vm = require('vm');
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8'), { filename: 'app.js' });

const sig = { aborted: false, addEventListener() {} };

(async () => {
  const p = id => window.PROVIDERS.find(x => x.id === id);

  console.log('--- 1. Wireformat-запрос (Cloudflare) ---');
  let r = await dohQuery(p('cloudflare'), 'example.com', 1, 5000, sig);
  console.log({ ok: r.ok, rcode: r.rcode, ms: Math.round(r.ms), answers: r.answers });

  console.log('--- 2. JSON-запрос (Google) ---');
  r = await dohQuery(p('google'), 'example.com', 1, 5000, sig);
  console.log({ ok: r.ok, rcode: r.rcode, ms: Math.round(r.ms), answers: r.answers });

  console.log('--- 3. Случайное имя (NXDOMAIN, rcode=3) ---');
  r = await dohQuery(p('cloudflare'), randomQueryName(0), 1, 5000, sig);
  console.log({ ok: r.ok, rcode: r.rcode, ms: Math.round(r.ms) });

  console.log('--- 4. Полный testProvider (AdGuard Default) ---');
  const st = await testProvider(p('adguard-ad'), { freq: 3, timeout: 4000, adTest: true }, sig, () => {}, () => {});
  console.log({ status: st.status, connect: Math.round(st.connect), samples: st.samples.map(Math.round), correct: st.correct, dnssec: st.dnssec, adblock: st.adblock, loss: st.loss });

  console.log('--- 5. Нет DoH у провайдера -> notestable ---');
  const st2 = await testProvider(p('yandex'), { freq: 2, timeout: 3000, adTest: false }, sig, () => {}, () => {});
  console.log({ status: st2.status, note: st2.note });
})().catch(e => { console.error('FAIL', e); process.exit(1); });
