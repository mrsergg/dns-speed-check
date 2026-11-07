// Полный прогон testProvider по всем провайдерам с DoH (как реальный запуск из браузера).
const vm = require('vm');
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, getElementById: () => ({ textContent: '', innerHTML: '', disabled: false, classList: { add() {}, remove() {}, toggle() {} } }) };
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'providers.js'), 'utf8'), { filename: 'providers.js' });
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8'), { filename: 'app.js' });

const sig = { aborted: false, addEventListener() {} };
(async () => {
  for (const p of window.PROVIDERS) {
    const st = await testProvider(p, { freq: 3, timeout: 3500, adTest: true }, sig, () => {}, () => {});
    const med = st.samples.length ? Math.round(median(st.samples)) : null;
    console.log(p.id.padEnd(20), String(st.status).padEnd(11), 'med=' + (med ?? '—'),
      'loss=' + st.loss, 'corr=' + st.correct, 'sec=' + st.dnssec, 'ad=' + st.adblock,
      st.opaque ? '[opaque]' : '', st.why || '');
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
