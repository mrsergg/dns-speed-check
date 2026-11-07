// Регрессия для шапки: IP/геолокация должны подхватываться из первого рабочего источника,
// а при полном отказе — показывать понятное состояние (а не вечное «определяем…»).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = ['providers.js', 'speedtest.js', 'app.js', 'dnsinfo.js'];

function makePage(fetchImpl) {
  const dom = new JSDOM(html, {
    url: 'http://localhost:8484/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = fetchImpl;
      window.AbortController = AbortController;
      window.console.debug = () => {};
      window.HTMLCanvasElement.prototype.getContext = () => null;
      window.WebSocket = class { constructor() { throw new Error('ws disabled in test'); } };
    },
  });
  for (const f of scripts) {
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(root, f), 'utf8');
    dom.window.document.body.appendChild(el);
  }
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom.window;
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const errors = [];

(async () => {
  // 1. Основной источник — ipwho.is
  let w = makePage(async (url) => {
    if (String(url).includes('ipwho.is')) return { ok: true, json: async () => ({ success: true, ip: '203.0.113.7', city: 'Test City', country: 'Testland' }) };
    throw new TypeError('offline');
  });
  await wait(300);
  if (w.document.getElementById('myip').textContent !== '203.0.113.7') errors.push('ipwho.is: IP не отображён');
  if (w.document.getElementById('geo').textContent !== 'Test City, Testland') errors.push('ipwho.is: гео не отображено');

  // 2. ipwho.is упал — используется ipapi.co
  w = makePage(async (url) => {
    if (String(url).includes('ipwho.is')) throw new TypeError('blocked');
    if (String(url).includes('ipapi.co')) return { ok: true, json: async () => ({ ip: '198.51.100.9', city: 'Fallback City', country_name: 'Fallbackland' }) };
    throw new TypeError('offline');
  });
  await wait(300);
  if (w.document.getElementById('myip').textContent !== '198.51.100.9') errors.push('ipapi.co fallback: IP не отображён');
  if (w.document.getElementById('geo').textContent !== 'Fallback City, Fallbackland') errors.push('ipapi.co fallback: гео не отображено');

  // 3. Все источники недоступны — понятное состояние вместо «определяем…»
  w = makePage(async () => { throw new TypeError('offline'); });
  await wait(300);
  if (w.document.getElementById('myip').textContent !== '—') errors.push('offline: ожидался «—»');
  if (!w.document.getElementById('geo').textContent.includes('не удалось')) errors.push('offline: нет сообщения об ошибке');

  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Header IP/geo lookup: primary, fallback and offline states OK');
})();
