// Дебаг-харнесс v2: аккуратно выполняем скрипты в контексте окна jsdom и кликаем чипы.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8484/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

const errors = [];
window.console.error = (...a) => errors.push(['console.error', ...a].map(String));
window.console.debug = () => {};
window.addEventListener('error', e => errors.push(['pageerror', String(e.message)]));
window.crypto = require('crypto').webcrypto;
window.performance = performance;
window.fetch = async () => { throw new TypeError('offline stub'); };
window.AbortController = AbortController;
window.scrollTo = () => {};

const load = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
window.PROVIDERS = undefined; window.CATS = undefined;
// один общий eval (строгий режим держит объявления в своей области видимости)
window.eval(load('providers.js') + '\n;\n' + load('app.js') + '\n;\ninit();');

console.log('PROVIDERS type:', typeof window.PROVIDERS, 'len:', (window.PROVIDERS || []).length);
const doc = window.document;
const count = () => [...doc.querySelectorAll('#providerList input')].filter(cb => cb.checked).length;
console.log('провайдеров:', doc.querySelectorAll('#providerList input').length, 'отмечено:', count());

for (const k of ['none', 'all', 'top', 'privacy', 'adblock']) {
  const el = doc.querySelector(`.chip[data-preset="${k}"]`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  console.log(`клик "${k}" -> отмечено: ${count()}`);
}
// фильтр адресов
const af = doc.querySelector('#addrFilter');
af.value = 'cloudflare';
af.dispatchEvent(new window.Event('input', { bubbles: true }));
console.log('фильтр "cloudflare" -> строк адресов:', doc.querySelectorAll('#addrBody tr').length);
af.value = '';
af.dispatchEvent(new window.Event('input', { bubbles: true }));
const htmlPL = doc.querySelector('#providerList').innerHTML;
console.log('карточки содержат DoH/DoT:', htmlPL.includes('DoH:') && htmlPL.includes('DoT:'));
console.log('CleanBrowsing DoT в таблице адресов:', doc.querySelector('#addrBody').innerHTML.includes('security-filter-dns.cleanbrowsing.org'));
const numFreq = doc.querySelector('#numFreq');
const numTimeout = doc.querySelector('#numTimeout');
const clickStep = (id, direction) => doc.querySelector(`button[data-number="${id}"][data-step="${direction}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
clickStep('numFreq', '-1');
if (numFreq.value !== '5') errors.push(['stepper', 'numFreq minus expected 5, got ' + numFreq.value]);
clickStep('numFreq', '1');
if (numFreq.value !== '6') errors.push(['stepper', 'numFreq plus expected 6, got ' + numFreq.value]);
clickStep('numTimeout', '1');
if (numTimeout.value !== '4500') errors.push(['stepper', 'timeout plus expected 4500, got ' + numTimeout.value]);
clickStep('numTimeout', '-1');
if (numTimeout.value !== '4000') errors.push(['stepper', 'timeout minus expected 4000, got ' + numTimeout.value]);
numFreq.value = '20'; clickStep('numFreq', '1');
if (numFreq.value !== '20') errors.push(['stepper', 'numFreq max limit failed']);
numTimeout.value = '1000'; clickStep('numTimeout', '-1');
if (numTimeout.value !== '1000') errors.push(['stepper', 'timeout min limit failed']);
console.log('Кнопки +/-: шаг запросов/таймаута и границы min/max OK');
console.log('\nERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'нет');
if (errors.length) process.exitCode = 1;
