// Проверка style.css: ищем правила, у которых все объявления отброшены парсером
// (признак «слипшихся» значений вроде padding:18px28px), и сверяем ключевые computed-стили.
// Запуск: node dev/stylecheck.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM('<!doctype html><html><head><style>' + css + '</style></head><body></body></html>');
const sheet = dom.window.document.styleSheets[0];
const bad = [];
let total =0;

function walk(rules) {
 for (const rule of rules) {
 if (rule.cssRules) { walk(rule.cssRules); continue; }
 if (!rule.selectorText) continue;
 total++;
 if (rule.style.length ===0) bad.push(rule.selectorText);
 }
}
walk(sheet.cssRules);

console.log('правил:', total);
console.log('подозрительных (0 валидных объявлений):', bad.length);
if (bad.length) console.log(bad.join('\n'));

// computed-стили на реальном HTML
const dom2 = new JSDOM(html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>'), { pretendToBeVisual: true });
const { window } = dom2;
const doc = window.document;
const cs = sel => window.getComputedStyle(doc.querySelector(sel));

const checks = [
 ['.card', 'padding-top'],
 ['.topbar', 'padding-left'],
 ['.speedtest-item', 'padding-top'],
 ['.btn.primary.big', 'padding-left'],
 ['main', 'max-width'],
 ['.chip', 'border-top-left-radius'],
 ['th', 'text-transform'],
];

for (const [sel, prop] of checks) {
 const el = doc.querySelector(sel);
 console.log(sel.padEnd(20), prop.padEnd(22), el ? (cs(sel).getPropertyValue(prop) || 'ПУСТО') : 'НЕТ ЭЛЕМЕНТА');
}
