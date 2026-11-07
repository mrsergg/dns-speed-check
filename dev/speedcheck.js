// Проверка доступности эндпоинтов Speedtest (CORS + ответ) — запуск: node dev/speedcheck.js
const TARGETS = [
 { name: 'cloudflare ping', url: 'https://speed.cloudflare.com/__down?bytes=1000', method: 'GET' },
 { name: 'cloudflare down', url: 'https://speed.cloudflare.com/__down?bytes=1000000', method: 'GET' },
 { name: 'cloudflare up', url: 'https://speed.cloudflare.com/__up', method: 'POST', body: new Uint8Array(512 *1024) },
 { name: 'httpbin down', url: 'https://httpbin.org/stream-bytes/1048576', method: 'GET' },
 { name: 'httpbin post', url: 'https://httpbin.org/post', method: 'POST', body: new Uint8Array(128 *1024) },
];

(async () => {
 for (const t of TARGETS) {
 const t0 = Date.now();
 try {
 const res = await fetch(t.url, {
 method: t.method,
 body: t.body,
 headers: { Origin: 'http://localhost:8484' },
 });
 const acao = res.headers.get('access-control-allow-origin');
 console.log(
 t.name.padEnd(18),
 String(res.status).padEnd(4),
 `${Date.now() - t0}ms`.padEnd(8),
 'ACAO=' + (acao ?? 'НЕТ'),
 res.headers.get('content-type') || ''
 );
 } catch (e) {
 console.log(t.name.padEnd(18), 'ERR', String(e.cause?.message || e).slice(0,70));
 }
 }
})();
