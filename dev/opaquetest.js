// Тест opaque-фолбэка: мокаем fetch — cors-режим кидает TypeError (как в браузере без ACAO), no-cors проходит.
const vm = require('vm');
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, getElementById: () => ({ textContent: '', innerHTML: '', disabled: false, classList: { add() {}, remove() {}, toggle() {} } }) };
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'providers.js'), 'utf8'), { filename: 'providers.js' });
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8'), { filename: 'app.js' });
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => (opts && opts.mode === 'cors') ? Promise.reject(new TypeError('Failed to fetch')) : realFetch(url, opts);

const sig = { aborted: false, addEventListener() {} };
(async () => {
  const dg = window.PROVIDERS.find(x => x.id === 'dg');
  const st = await testProvider(dg, { freq: 3, timeout: 3500, adTest: true }, sig, () => {}, () => {});
  console.log(JSON.stringify({ status: st.status, med: st.samples.length ? Math.round(median(st.samples)) : null, opaque: !!st.opaque, correct: st.correct, dnssec: st.dnssec, adblock: st.adblock, loss: st.loss }, null, 2));
  // Полностью недоступный сервер -> fail
  globalThis.fetch = () => Promise.reject(new TypeError('net down'));
  const st2 = await testProvider({ ...dg, id: 'dead', name: 'dead' }, { freq: 2, timeout: 2000, adTest: false }, sig, () => {}, () => {});
  console.log(JSON.stringify({ status: st2.status, why: st2.why }));
})();
