// Проверка CORS + работоспособности DoH-эндпоинтов всех провайдеров (по Origin-заголовку).
const vm = require('vm');
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, getElementById: () => ({}) };
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'providers.js'), 'utf8'), { filename: 'providers.js' });
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8'), { filename: 'app.js' });

const sig = { aborted: false, addEventListener() {} };
(async () => {
  for (const p of window.PROVIDERS) {
    if (!p.doh && !p.json && !p.jsonName) { console.log(p.id.padEnd(20), 'SKIP (нет DoH)'); continue; }
    const r = await dohQuery(p, 'example.com', 1, 5000, sig);
    let cors = '?';
    try {
      const url = p.jsonName ? `${p.json}?name=example.com&type=A` : `${(p.json || p.doh)}?dns=${b64url(buildQueryWire('example.com'))}`;
      const res = await fetch(url, { headers: Object.assign({ Origin: 'https://dns-test.local' }, p.jsonName ? { Accept: 'application/dns-json' } : { Accept: 'application/dns-message' }) });
      const acao = res.headers.get('access-control-allow-origin');
      cors = acao == null ? 'НЕТ ACAO' : (acao === '*' ? 'ACAO *' : `ACAO=${acao}`);
    } catch (e) { cors = 'ERR ' + String(e && e.cause && e.cause.message || e).slice(0, 50); }
    console.log(p.id.padEnd(20), `${r.ok ? 'OK rcode=' + r.rcode + ' ' + Math.round(r.ms) + 'ms' : 'FAIL ' + (r.error || '')}`.padEnd(28), cors);
  }
})();
