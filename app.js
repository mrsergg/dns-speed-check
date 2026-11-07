/* DNS Тестер — движок.
 * Идея проверки вдохновлена dnscheck.tools (addr.tools, AGPL-3.0):
 *  - "свежие" случайные домены, чтобы кэш/CDN не искажали время;
 *  - проверка DNSSEC-валидации (SERVFAIL на заведомо битой подписи);
 *  - корректность и доступность ответов.
 * Для опроса конкретных серверов используется DoH (DNS-over-HTTPS), который умеет браузер.
 */
'use strict';

/* ---------------- Утилиты ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const randLabel = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const TLD_POOL = ['com','net','org','ru','de','io','info'];
function randomQueryName(i) { return `${randLabel()}-${Date.now().toString(36)}.fresh-probe.${TLD_POOL[i % TLD_POOL.length]}`; }

/* ---------------- DNS wireformat (RFC1035/8484) ---------------- */
function buildQueryWire(name, qtype = 1) {
  const parts = name.split('.').map(l => {
    const b = new TextEncoder().encode(l);
    if (b.length > 63) throw new Error('label too long');
    return [b.length, ...b];
  });
  const body = [...parts.flat(), 0, 0, qtype, 0, 1]; // вопрос: QNAME, 0, QTYPE=A, QCLASS=IN
  const id = crypto.getRandomValues(new Uint16Array(1))[0];
  const header = [ id >> 8, id & 0xff, 0x01, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0 ]; // RD=1, QDCOUNT=1
  return new Uint8Array([...header, ...body]);
}

// Разбор ответа: возвращаем rcode, answers [{type, a, cname}]
function parseDnsWire(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 12) return { error: 'short' };
  const flags = v.getUint16(2);
  const rcode = flags & 0xF;
  const qd = v.getUint16(4), an = v.getUint16(6), ns = v.getUint16(8);
  let off = 12;
  const skipName = start => { let p = start, guard = 0; while (guard++ < 100) { const len = buf[p]; if (len === 0) return p + 1; if (len & 0xC0) return p + 2; p += len + 1; } return p; };
  for (let i = 0; i < qd; i++) { off = skipName(off); off += 4; }
  const answers = [];
  const cnt = an + ns;
  for (let i = 0; i < cnt && off + 10 <= buf.length; i++) {
    off = skipName(off);
    const type = v.getUint16(off), rdlen = v.getUint16(off + 8);
    const rdStart = off + 10;
    let a = null, cname = null;
    if (type === 1 && rdlen === 4) a = [buf[rdStart], buf[rdStart+1], buf[rdStart+2], buf[rdStart+3]].join('.');
    if (type === 28 && rdlen === 16) {
      const out = [];
      for (let j = 0; j < 16; j += 2) out.push(((buf[rdStart+j]<<8)|buf[rdStart+j+1]).toString(16).padStart(4,'0'));
      let ipv6 = out.join(':').replace(/(^|:)0{1,3}(?=:|$)/g, '$1').replace(/((^|:){2})+/g, '::::');
      a = ipv6;
    }
    if (type === 5) {
      try {
        let p = rdStart; const labels = [];
        for (let g = 0; g < 60; g++) { const l = buf[p]; if (l === 0) break; if (l & 0xC0) { const q = ((l & 0x3F) << 8) | buf[p+1]; let pp = q; let lbls2 = []; for (let h = 0; h < 60; h++) { const l2 = buf[pp]; if (l2 === 0) break; if (l2 & 0xC0) break; lbls2.push(String.fromCharCode(...buf.subarray(pp+1, pp+1+l2))); pp += l2 + 1; } labels.push(...lbls2); break; } labels.push(String.fromCharCode(...buf.subarray(p+1, p+1+l))); p += l + 1; }
        cname = labels.join('.') || null;
      } catch (e) {}
    }
    if (i < an) answers.push({ type, a, cname });
    off = rdStart + rdlen;
  }
  return { rcode, answers };
}

/* ---------------- DoH запрос ---------------- */
let running = false, runToken = 0;

async function dohQuery(prov, name, qtype, timeoutMs, signal) {
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('timeout'), timeoutMs);
  signal?.addEventListener('abort', () => ctl.abort('stopped'), { once: true });
  try {
    let url, role = 'wire';
    if (prov.jsonName) { url = `${prov.json}?name=${encodeURIComponent(name)}&type=A`; role = 'jsonName'; }
    else if (prov.wireGetJson) { url = `${prov.json}?dns=${b64url(buildQueryWire(name, qtype))}`; }
    else if (prov.json) { url = `${prov.json}?dns=${b64url(buildQueryWire(name, qtype))}`; }
    else if (prov.doh) { url = `${prov.doh}?dns=${b64url(buildQueryWire(name, qtype))}`; }
    else throw new Error('нет DoH у провайдера');
    const headers = prov.jsonName ? { Accept: 'application/dns-json' } : { Accept: 'application/dns-message' };
    let ms, res;
    try {
      res = await fetch(url, { headers, signal: ctl.signal, cache: 'no-store', mode: 'cors' });
      ms = performance.now() - t0;
    } catch (netErr) {
      if (ctl.signal.aborted) { throw netErr; } // таймаут/стоп обработается ниже
      // CORS-запрет или сетевая ошибка: различаем через no-cors probe (opaque-ответ, время всё равно честное)
      try {
        const t = performance.now();
        await fetch(url, { mode: 'no-cors', signal: ctl.signal, cache: 'no-store' });
        if (performance.now() - t0 > timeoutMs - 500) throw new Error('slow');
        return { ok: true, ms: performance.now() - t0, opaque: true };
      } catch (e2) { throw netErr; }
    }
    if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}`, httpStatus: res.status };
    if (role === 'jsonName') {
      const j = await res.json();
      const answers = (j.Answer || []).map(x => ({ type: x.type, a: x.type === 1 ? x.data : x.type === 28 ? x.data : (x.type === 5 ? String(x.data).replace(/\.$/,'') : null) }));
      return { ok: true, ms, rcode: j.Status ?? 0, answers };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const parsed = parseDnsWire(buf);
    if (parsed.error === 'short') return { ok: false, ms, error: 'битый DoH ответ' };
    return { ok: true, ms, rcode: parsed.rcode, answers: parsed.answers };
  } catch (e) {
    const aborted = e === 'timeout' || (e && (String(e).includes('abort') || e.name === 'AbortError' || e.name === 'TimeoutError'));
    if (aborted) return { ok: false, ms: performance.now() - t0, error: 'таймаут' };
    return { ok: false, ms: performance.now() - t0, error: String(e && e.message || e).slice(0, 60) };
  } finally { clearTimeout(timer); }
}

function b64url(u8) {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isBlockedAnswer = (rcode, answers = []) =>
  rcode === 3 || // NXDOMAIN на домене, подтверждённом контрольным публичным резолвером
  answers.some(a => a.a && /^0\.0\.0\.0$|^127\.0\.0\.1$|^94\.140\.14\.3[34]$|^::0|(^|:)(0+:)+$/.test(a.a));

async function testAdblock(prov, timeoutMs, signal) {
  const domain = 'doubleclick.net';
  const control = await dohQuery({ id:'control-google', json:'https://dns.google/resolve', jsonName:true }, domain, 1, timeoutMs, signal);
  if (!control.ok || control.rcode !== 0 || !control.answers.some(a => a.a)) {
    return { status:'unknown', reason:'Контрольный DNS не подтвердил ответ домена' };
  }
  const tested = await dohQuery(prov, domain, 1, timeoutMs, signal);
  if (!tested.ok) return { status:'unknown', reason:tested.error || 'DNS-запрос не удался' };
  if (isBlockedAnswer(tested.rcode, tested.answers)) return { status:'blocked' };
  if (tested.rcode === 0 && tested.answers.some(a => a.a)) return { status:'allowed' };
  return { status:'unknown', reason:`Неожиданный DNS-код ответа ${tested.rcode}` };
}

/* ---------------- Тест одного провайдера ---------------- */
const TEST_DOMAIN = 'example.com';
const DNSSEC_BAD = 'dnssec-failed.org';

async function testProvider(prov, opts, sig, onUpdate, onStage) {
  const st = { id: prov.id, name: prov.name, prov, connect: null, samples: [], loss: 0, status: 'run' };
  const total = opts.freq + 3; // warm-up + N замеров + DNSSEC + реклама
  let stage = 0;
  const bump = () => { stage++; onStage?.(stage, total); };
  onUpdate(st);
  if (!prov.doh && !prov.json && !prov.jsonName && !prov.wireGetJson) {
    st.status = 'notestable'; st.note = 'нет публичного DoH — из браузера не проверить'; onUpdate(st); return st;
  }
  // 1. warm-up + корректность (первый запрос включает TCP+TLS — учитываем как connect)
  bump();
  const first = await dohQuery(prov, TEST_DOMAIN, 1, opts.timeout, sig);
  if (sig.aborted) return st;
  if (!first.ok) { st.status = 'fail'; st.loss = 1; st.why = first.error; onUpdate(st); return st; }
  if (first.opaque) {
    // DoH сервер доступен, но без CORS — браузер не может прочитать ответ.
    //measure speed honestly, ответ не читается
    st.opaque = true; st.correct = null; st.dnssec = 'na'; st.adblock = 'na';
  } else {
    st.connect = first.ms;
    st.correct = first.rcode === 0 && first.answers.some(a => a.a || a.cname);
    if (!st.correct) { st.status = 'fail'; st.why = `домен не резолвится, rcode=${first.rcode}`; onUpdate(st); return st; }
  }

  // 2. скорость — N запросов к случайным (некэшируемым) именам, по одному за раз
  for (let i = 0; i < opts.freq; i++) {
    if (sig.aborted) break;
    const r = await dohQuery(prov, randomQueryName(i), 1, opts.timeout, sig);
    if (r.ok) st.samples.push(r.ms); else st.loss++;
    bump(); onUpdate(st);
  }
  if (!st.samples.length && !sig.aborted) { st.status = 'fail'; st.why = st.loss >= opts.freq ? 'все запросы потеряны' : 'остановлено'; onUpdate(st); return st; }

  // 3. DNSSEC: заведомо невалидная подпись -> валидирующий сервер обязан вернуть SERVFAIL(2)
  if (!sig.aborted && !st.opaque) {
    bump();
    const sec = await dohQuery(prov, DNSSEC_BAD, 1, opts.timeout, sig);
    if (sig.aborted) { onUpdate(st); return st; }
    st.dnssec = sec.ok ? (sec.rcode === 2 ? 'ok' : (sec.rcode === 0 ? 'no' : 'warn')) : 'na';
  }
  // 4. реклама
  if (opts.adTest && !sig.aborted && !st.opaque) {
    bump();
    const ad = await testAdblock(prov, opts.timeout, sig);
    if (!sig.aborted) st.adblock = ad.status === 'blocked' ? 'ok' : ad.status === 'allowed' ? 'no' : 'na';
  }
  st.status = 'done';
  onUpdate(st);
  return st;
}

/* ---------------- Статистика ---------------- */
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; };

/* ---------------- Состояние/UI ---------------- */
let customProviders = [];
let lastResults = [], sortKey = 'median', sortAsc = true;
const ALL = () => [...window.PROVIDERS, ...customProviders];

function checkedSet() {
  return new Set([...document.querySelectorAll('#providerList input:checked')].map(el => el.dataset.id));
}

function renderProviderList() {
  const checked = checkedSet();
  const list = ALL();
  $('providerList').innerHTML = list.map(p => {
    const on = checked.has(p.id) ? 'checked' : '';
    const nowire = (!p.doh && !p.json) ? '<span class="tag nowire" title="Нет публичного DoH с CORS — из браузера не тестируется, можно только настроить">б/теста</span>' : '';
    const tag = `<span class="tag">${window.CATS.find(c => c.id === p.cat)?.label || ''}</span>`;
    const encAddr = p.doh || p.json ? `DoH: ${esc(String(p.doh || p.json).replace(/^https?:\/\//, ''))}` : '';
    const dotAddr = p.dot ? `${encAddr ? ' · ' : ''}DoT: ${esc(p.dot)}` : '';
    const encLine = [encAddr, dotAddr].filter(Boolean).join('');
    return `<label class="prov">
      <input type="checkbox" data-id="${esc(p.id)}" ${on}>
      <div>
        <div class="pn">${esc(p.name)} ${tag} ${nowire}</div>
        <div class="ips">DNS1: ${esc((p.ipv4 || [])[0] || '-')}${(p.ipv4 || [])[1] ? ' · DNS2: ' + esc(p.ipv4[1]) : ''}</div>
        ${encLine ? `<div class="ips">${encLine}</div>` : ''}
        <div class="pd">${esc(p.desc || '')}</div>
      </div>
    </label>`;
  }).join('');
}

function preset(kind) {
  [...document.querySelectorAll('#providerList input')].forEach(cb => { cb.checked = false; });
  if (kind === 'all') { document.querySelectorAll('#providerList input').forEach(cb => cb.checked = true); return; }
  if (kind === 'none') return;
  const list = ALL();
  const want = {
    top: list.filter(p => ['cloudflare','google','quad9','adguard','dnssb','controld','mullvad'].includes(p.id)),
    adblock: list.filter(p => p.cat === 'adblock' || p.cat === 'family'),
    privacy: list.filter(p => p.cat === 'privacy'),
  }[kind] || [];
  new Set(want.map(p => p.id)).forEach(id => {
    const cb = document.querySelector(`#providerList input[data-id="${CSS.escape(id)}"]`);
    if (cb) cb.checked = true;
  });
  saveState();
}

function saveState() {
  try { localStorage.setItem('dnstest-state', JSON.stringify({
    checked: [...checkedSet()],
    freq: +$('numFreq').value, timeout: +$('numTimeout').value, adTest: $('chkAdtest').checked,
    custom: customProviders, sortKey, sortAsc,
  })); } catch (e) {}
  $('btnRun').disabled = checkedSet().size === 0;
  $('btnRun').classList.toggle('hidden', checkedSet().size === 0);
  $('btnStop').classList.add('hidden');
}

function loadState() {
  let s = {}; try { s = JSON.parse(localStorage.getItem('dnstest-state') || '{}'); } catch (e) {}
  $('numFreq').value = s.freq || 6; $('numTimeout').value = s.timeout || 4000;
  $('chkAdtest').checked = s.adTest !== false;
  customProviders = s.custom || [];
  renderProviderList();
  if (s.checked) {
    s.checked.forEach(id => { const cb = document.querySelector(`#providerList input[data-id="${CSS.escape(id)}"]`); if (cb) cb.checked = true; });
  } else preset('top');
  sortKey = s.sortKey || 'median'; sortAsc = s.sortAsc !== false;
}

/* ---------------- Запуск ---------------- */
async function runTests() {
  const ids = [...checkedSet()];
  if (!ids.length) return;
  const opts = { freq: Math.max(3, Math.min(20, +$('numFreq').value || 6)), timeout: +$('numTimeout').value || 4000, adTest: $('chkAdtest').checked };
  window._adTestWanted = opts.adTest;
  const provs = ids.map(id => ALL().find(p => p.id === id)).filter(Boolean);
  const token = ++runToken; running = true;
  const ctl = new AbortController();
  window._stopSig = ctl.signal;
  $('btnRun').classList.add('hidden'); $('btnStop').classList.remove('hidden');
  $('btnRerun').disabled = false; $('progressBar').style.width = '3%';
  $('runStatus').textContent = `Тест ${provs.length} серверов × ~${opts.freq + 3} запросов... первый запрос меряет подключение (TCP+TLS), это нормально.`;
  $('recommendation').classList.add('hidden');

  const live = {};
  const stageTotal = provs.length * (opts.freq + 3);
  const stageDone = {};
  let stageCount = 0;
  const onStage = (n, total, prov) => {
    if (stageDone[prov] !== true) { stageCount++; if (n >= total) stageDone[prov] = true; }
    $('progressBar').style.width = Math.min(99, stageCount / stageTotal * 100) + '%';
  };
  const results = await Promise.all(provs.map(async prov => {
    const st = await testProvider(prov, opts, ctl.signal,
      s => { live[s.id] = s; renderResults(Object.values(live), null); },
      (n, total) => onStage(n, total, prov.id));
    return st;
  }));
  if (token !== runToken) return;
  lastResults = results;
  $('progressBar').style.width = '100%';
  running = false;
  $('btnStop').classList.add('hidden'); $('btnRun').classList.remove('hidden');
  $('btnRun').textContent = '↻ Запустить заново';
  $('runStatus').textContent = results.filter(r => r.status === 'done').length + ' серверов ответили · ' +
    results.filter(r => r.status === 'fail').length + ' с ошибками · ' +
    results.filter(r => r.status === 'notestable').length + ' без DoH (не тестируются из браузера)';
  $('btnCsv').disabled = false;
  renderResults(lastResults, null);
  renderRecommendation(lastResults);
  saveState();
}

function stopTests() { if (window._stopSig) { try { window._stopSig.abort(); } catch(e){} } running = false; $('btnStop').classList.add('hidden'); $('btnRun').classList.remove('hidden'); 
  $('runStatus').textContent = 'Остановлено пользователем. Частичные результаты ниже.'; }

/* ---------------- Таблица результатов ---------------- */
function resultSortVal(r) {
  const s = r.samples || [];
  return s.length ? median(s) : (r.connect != null ? r.connect : 99999);
}

function renderResults(results, provsHidden) {
  const tbody = $('resultsBody');
  const list = [...results].sort((a, b) => {
    const av = resultSortVal(a), bv = resultSortVal(b);
    return sortAsc ? av - bv : bv - av;
  });
  const usable = list.filter(r => r.status === 'done' && r.samples.length);
  const best = usable[0];
  const maxMed = Math.max(...usable.map(r => median(r.samples)), 1);

  tbody.innerHTML = list.map((r, idx) => {
    const p = r.prov;
    const med = r.samples.length ? median(r.samples) : null;
    const min = r.samples.length ? Math.min(...r.samples) : null;
    const avg = r.samples.length ? r.samples.reduce((a,b)=>a+b,0)/r.samples.length : null;
    const failure = r.status === 'fail';
    const notest = r.status === 'notestable';
    const isBest = best && r.id === best.id;
    const opaqueTag = r.opaque && !notest && !failure ? '<span class="badge warn" title="У DoH этого сервера нет CORS: скорость измерена точно, но браузер не может прочитать сам ответ — проверка DNSSEC/блокировки недоступна">≈ только скорость</span>' : '';
    let speedbar = '';
    if (med != null) speedbar = `<span class="speedbar" style="width:${Math.max(8, 110 * (1 - med / (maxMed * 1.6)))}px"></span>`;
    const badge = (kind, text, tip = '') => `<span class="badge ${kind}"${tip ? ` data-tip="${esc(tip)}" tabindex="0"` : ''}>${text}</span>`;
    const cells = {
      median: med != null ? `<td class="num">${speedbar}${Math.round(med)}</td>` : `<td class="num muted">—</td>`,
      min: min != null ? `<td class="num">${Math.round(min)}</td>` : `<td class="num muted">—</td>`,
      connect: r.connect != null ? `<td class="num">${Math.round(r.connect)}</td>` : `<td class="num muted">—</td>`,
      loss: `<td class="num ${r.loss ? 'error-cell' : 'muted'}">${r.loss ? `${r.loss} ✕${r.why ? ' · ' + esc(r.why) : ''}` : '0'}</td>`,
      correct: r.correct == null ? badge('na', 'Корректность: —', 'Не удалось проверить корректность DNS-ответа') : r.correct ? badge('ok', 'Корректность: да', 'Домен успешно разрешён в IP-адрес') : badge('bad', 'Корректность: нет', 'DNS-сервер не вернул корректный ответ'),
      dnssec: r.status === 'notestable' ? badge('na', 'DNSSEC: нет DoH', 'DNSSEC нельзя проверить: DoH endpoint недоступен для браузера') :
        (r.dnssec === 'ok' ? badge('ok', 'DNSSEC: защищает', 'Сервер проверяет подписи DNSSEC и отклоняет некорректные') : r.dnssec === 'no' ? badge('bad', 'DNSSEC: уязвим', 'Сервер не отклонил заведомо некорректную DNSSEC-подпись') : badge('warn', 'DNSSEC: ?', 'Проверка DNSSEC не завершилась')),
      adblock: !window._adTestWanted ? badge('na', 'Реклама: выкл', 'Тест блокировки рекламы отключён в настройках') : (r.adblock === 'ok' ? badge('warn', 'Реклама: блокирует', 'Тестовый рекламный домен заблокирован') : r.adblock === 'no' ? badge('ok', 'Реклама: пропускает', 'Тестовый рекламный домен разрешён') : r.status === 'notestable' ? badge('na', 'Реклама: —', 'Нет доступа к DoH для проверки блокировки') : badge('na', 'Реклама: ?', 'Проверка блокировки рекламы не завершилась')),
    };
    const statusLine = `<span class="result-statuses">${cells.correct}${cells.dnssec}${cells.adblock}</span>`;
    const name = `<td class="res-name"><b>${esc(p.name)}</b>${opaqueTag}<span class="ips">${esc(p.ipv4.join(' / ') || (p.doh || ''))}</span>${statusLine}</td>`;
    const num = `<td>${idx + 1}${isBest ? ' 🥇' : ''}</td>`;
    const state = failure ? `<tr class="dim" data-id="${esc(p.id)}">` : notest ? `<tr class="dim" data-id="${esc(p.id)}">` : `<tr class="${isBest ? 'best' : ''}" data-id="${esc(p.id)}">`;
    return state + num + name + cells.median + cells.min + cells.connect + cells.loss + '</tr>';
  }).join('');
}

function renderRecommendation(results) {
  const usable = results.filter(r => r.status === 'done' && r.samples.length && r.correct);
  if (!usable.length) return;
  const ranked = [...usable].sort((a, b) => resultSortVal(a) - resultSortVal(b));
  const top = ranked[0];
  const rec = `
    <div>🏆 <b>Рекомендуем для вас: <span style="color:var(--green)">${esc(top.prov.name)}</span></b>
      — медиана ${Math.round(median(top.samples))} мс, ошибок: ${top.loss}, DNSSEC: ${top.dnssec === 'ok' ? '✓' : '✗'}.</div>
    <div class="muted small" style="margin-top:4px">Если хотите блокировку рекламы: fastest-фильтрующий — ${
      esc(ranked.find(r => r.adblock === 'ok')?.prov.name || '—')} (${
      ranked.find(r => r.adblock === 'ok') ? Math.round(median(ranked.find(r => r.adblock === 'ok').samples)) + ' мс' : 'нет протестированных фильтрующих'}).
      Помните: скорость зависит от вашего города/провайдера — при смене сети перезапустите тест.</div>`;
  const el = $('recommendation');
  el.innerHTML = rec; el.classList.remove('hidden');
}

/* ---------------- Справочник адресов ---------------- */
function addrCopyText(p) {
  const v4 = p.ipv4 || [], v6 = p.ipv6 || [];
  const parts = [`${p.name}: ${v4.join(', ')}`];
  if (v4[0] && v4[1]) parts[0] = `${p.name}: DNS1 ${v4[0]}, DNS2 ${v4[1]}`;
  if (v6.length) parts.push(`IPv6: ${v6.join(', ')}`);
  if (p.doh || p.json) parts.push(`DoH: ${p.doh || p.json}`);
  if (p.dot) parts.push(`DoT: ${p.dot}`);
  return parts.join(' · ');
}

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); } catch (e2) {}
    ta.remove();
  }
  if (btn) { const old = btn.textContent; btn.textContent = '✓'; setTimeout(() => btn.textContent = old, 1200); }
}

function renderAddrTable() {
  const f = (($('addrFilter')?.value) || '').trim().toLowerCase();
  const v4 = p => p.ipv4 || [], v6 = p => p.ipv6 || [];
  const list = ALL().filter(p => !f ||
    [p.name, v4(p).join(' '), v6(p).join(' '), p.doh || '', p.json || '', p.dot || ''].join(' ').toLowerCase().includes(f));
  $('addrBody').innerHTML = list.map(p => {
    const cell = v => v ? `<td class="ip">${esc(v)}</td>` : '<td class="muted">—</td>';
    const hasAny = v4(p).length || v6(p).length || p.doh || p.dot;
    return `<tr class="${hasAny ? '' : 'dim'}">
      <td class="res-name"><b>${esc(p.name)}</b></td>
      ${cell(v4(p)[0])}${cell(v4(p)[1])}${cell(v6(p).join(', ') || null)}
      ${p.doh || p.json ? `<td class="ip">${esc(p.doh || p.json)}</td>` : '<td class="muted">—</td>'}
      ${cell(p.dot)}
      ${hasAny ? `<td><button class="btn ghost small" data-addr-id="${esc(p.id)}" style="padding:3px 10px;font-size:12px">📋 копировать</button></td>` : '<td></td>'}
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="muted">Ничего не найдено</td></tr>`;

  $('addrBody').querySelectorAll('[data-addr-id]').forEach(btn =>
    btn.onclick = () => { const p = ALL().find(x => x.id === btn.dataset.addrId); copyText(addrCopyText(p), btn); });
}

/* ---------------- Местоположение клиента ---------------- */
async function fetchJsonWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || j.success === false || j.error) throw new Error('bad payload');
    return j;
  } finally { clearTimeout(timer); }
}

async function detectYou() {
  const setGeo = t => { const el = $('geo'); if (el) el.textContent = t; };
  const setIp = t => { const el = $('myip'); if (el) el.textContent = t; };
  // ipwho.is первым: отдаёт CORS-заголовки и не закрыт Cloudflare-челленджем.
  const sources = [
    { url: 'https://ipwho.is/', map: j => ({ ip: j.ip, geo: [j.city, j.country].filter(Boolean).join(', ') }) },
    { url: 'https://ipapi.co/json/', map: j => ({ ip: j.ip, geo: [j.city, j.country_name || j.country].filter(Boolean).join(', ') }) },
    { url: 'https://ipinfo.io/json', map: j => ({ ip: j.ip, geo: [j.city, j.region].filter(Boolean).join(', ') }) },
  ];
  for (const src of sources) {
    try {
      const j = await fetchJsonWithTimeout(src.url, 7000);
      const { ip, geo } = src.map(j);
      if (!ip) throw new Error('no ip');
      setIp(ip);
      setGeo(geo || '—');
      return;
    } catch (e) { console.debug('lookup failed:', src.url, e.message); }
  }
  setGeo('не удалось определить');
  setIp('—');
}

/* ---------------- CSV ---------------- */
function downloadCsv() {
  if (!lastResults.length) return;
  const rows = [['DNS','DNS1','DNS2','DoH','Медиана мс','Мин мс','Connect мс','Среднее мс','Ошибок','Корректность','DNSSEC','Блок рекламы']];
  const sorted = [...lastResults].sort((a, b) => resultSortVal(a) - resultSortVal(b));
  sorted.forEach(r => {
    rows.push([r.name, r.prov.ipv4[0] || '', r.prov.ipv4[1] || '', r.prov.doh || '', 
      r.samples.length ? Math.round(median(r.samples)) : '', r.samples.length ? Math.round(Math.min(...r.samples)) : '',
      r.connect != null ? Math.round(r.connect) : '', r.samples.length ? Math.round(r.samples.reduce((a,b)=>a+b,0)/r.samples.length) : '',
      r.loss ?? '', r.correct ? 'да' : 'нет', r.dnssec === 'ok' ? 'защищает' : r.dnssec === 'no' ? 'не валидирует' : '—',
      r.adblock === 'ok' ? 'блокирует' : r.adblock === 'no' ? 'пропускает' : '—']);
  });
  const csv = '\uFEFF' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'dns-test-results.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- Свой DoH ---------------- */
function addCustom() {
  const rawUrl = $('customDoh').value.trim();
  let parsed;
  try { parsed = new URL(rawUrl); } catch (_) { alert('Введите корректный HTTPS URL DoH, например https://dns.example.com/dns-query'); return; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    alert('Для безопасности поддерживаются только HTTPS DoH URL без логина и пароля.'); return;
  }
  const url = parsed.href;
  const id = 'custom-' + Math.random().toString(36).slice(2, 8);
  customProviders.push({
    id, name: 'Свой · ' + (new URL(url).hostname), cat: 'privacy', geo: 'custom',
    desc: 'Пользовательский DoH, добавлен вручную', ipv4: [], ipv6: [],
    doh: url.split('?')[0], json: null, dohOnly: true,
  });
  $('customDoh').value = '';
  renderProviderList();
  const cb = document.querySelector(`#providerList input[data-id="${id}"]`);
  if (cb) cb.checked = true;
  saveState();
}

function initMatrixBackground() {
  const canvas = $('matrixCanvas');
  if (!canvas || !window.CanvasRenderingContext2D || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const glyphs = '01010101010101010101010101';
  const columns = [];
  let width = 0, height = 0, raf = 0, last = 0;
  const size = 18;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${size}px Cascadia Code,Consolas,monospace`;
    columns.length = 0;
    const count = Math.ceil(width / size);
    for (let i = 0; i < count; i++) columns.push({ y: Math.random() * height, speed: 18 + Math.random() * 42, length: 7 + Math.random() * 17 });
  };
  const draw = time => {
    raf = requestAnimationFrame(draw);
    if (time - last < 42) return;
    last = time;
    ctx.fillStyle = 'rgba(5,8,16,.14)';
    ctx.fillRect(0,0,width,height);
    ctx.font = `600 ${size}px Cascadia Code,Consolas,monospace`;
    ctx.textAlign = 'center';
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const x = i * size + size / 2;
      const headY = col.y;
      for (let j = 0; j < col.length; j++) {
        const y = headY - j * size;
        if (y < -size || y > height + size) continue;
        const alpha = Math.max(.02, .23 * (1 - j / col.length));
        ctx.fillStyle = j === 0 ? `rgba(215,255,255,${Math.min(.9,alpha * 3.5)})` : `rgba(0,255,170,${alpha})`;
        ctx.fillText(glyphs[Math.random() * glyphs.length | 0],x,y);
      }
      if (Math.random() < .0018) {
        const gy = Math.max(0,Math.min(height,headY - Math.random() * col.length * size));
        ctx.fillStyle = Math.random() > .5 ? 'rgba(255,0,122,.42)' : 'rgba(0,236,255,.4)';
        ctx.fillRect(x - size * .48,gy,size * (.8 + Math.random() * 1.4),1 + Math.random() * 2);
      }
      col.y += col.speed * (time ? .042 : .04);
      if (col.y - col.length * size > height && Math.random() > .97) {
        col.y = -Math.random() * height * .35;
        col.speed = 18 + Math.random() * 42;
        col.length = 7 + Math.random() * 17;
      }
    }
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });
  if (reduceMotion) {
    ctx.fillStyle = 'rgba(5,8,16,.04)'; ctx.fillRect(0,0,width,height);
    return;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = 0; raf = requestAnimationFrame(draw); }
  });
  raf = requestAnimationFrame(draw);
}

function initResultTooltips() {
  const tip = document.createElement('div');
  tip.className = 'result-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  let active = null;

  const hide = () => {
    tip.classList.remove('is-visible');
    tip.setAttribute('aria-hidden', 'true');
    if (active) active.removeAttribute('aria-describedby');
    active = null;
  };
  const show = el => {
    if (!el || !el.dataset.tip) return;
    active = el;
    tip.textContent = el.dataset.tip;
    tip.classList.add('is-visible');
    tip.setAttribute('aria-hidden', 'false');
    el.setAttribute('aria-describedby', 'dns-result-tooltip');
    tip.id = 'dns-result-tooltip';
    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - tipRect.width / 2), window.innerWidth - tipRect.width - 12);
    const top = rect.top - tipRect.height - 10 > 8 ? rect.top - tipRect.height - 10 : Math.min(window.innerHeight - tipRect.height - 8, rect.bottom + 10);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  document.addEventListener('pointerover', e => {
    const el = e.target.closest('.badge[data-tip]');
    if (el) show(el);
  });
  document.addEventListener('pointerout', e => {
    if (active && e.target.closest('.badge[data-tip]') === active && !active.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('focusin', e => show(e.target.closest('.badge[data-tip]')));
  document.addEventListener('focusout', e => { if (e.target.closest('.badge[data-tip]')) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}

/* ---------------- Инициализация ---------------- */
function init() {
  initMatrixBackground();
  initResultTooltips();
  // Рендеры идут в try/catch: даже если один упадёт, обработчики кнопок всё равно привяжутся
  try { renderProviderList(); } catch (e) { console.error('renderProviderList:', e); }
  try { loadState(); } catch (e) { console.error('loadState:', e); }
  try { renderAddrTable(); } catch (e) { console.error('renderAddrTable:', e); }
  try { $('addrFilter').oninput = renderAddrTable; } catch (e) { console.error('addrFilter:', e); }
  try { detectYou(); } catch (e) { console.error('detectYou:', e); }
  document.querySelectorAll('.chip[data-preset]').forEach(ch => ch.onclick = () => { preset(ch.dataset.preset); saveState(); });
  $('providerList').addEventListener('change', saveState);
  $('btnRun').onclick = runTests;
  $('btnStop').onclick = stopTests;
  $('btnAddCustom').onclick = addCustom;
  $('btnCsv').onclick = downloadCsv;
  $('btnRerun').onclick = runTests;
  document.querySelectorAll('th.sortable').forEach(th => th.onclick = () => {
    const key = th.dataset.s;
    sortAsc = sortKey === key ? !sortAsc : key === 'median'; sortKey = key;
    renderResults(lastResults, null); saveState();
  });
  document.querySelectorAll('.number-control button[data-number]').forEach(btn => btn.onclick = () => {
    const input = $(btn.dataset.number);
    if (!input) return;
    const step = Number(input.step) || 1;
    const min = Number(input.min);
    const max = Number(input.max);
    const next = Number(input.value || min || 0) + Number(btn.dataset.step) * step;
    input.value = String(Math.min(Number.isFinite(max) ? max : next, Math.max(Number.isFinite(min) ? min : next, next)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ['numFreq','numTimeout','chkAdtest'].forEach(id => $(id).onchange = saveState);
}

document.addEventListener('DOMContentLoaded', init);

