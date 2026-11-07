/* Speedtest — рабочая реализация на чистом браузерном JS.
 * Ping, Download, Upload — последовательно (чтобы не мешали друг другу).
 * Основной бэкенд: speed.cloudflare.com (__down/__up, открытый CORS).
 * Запасной download: httpbin.org/stream-bytes (CORS). Скорость — настоящие Мбит/с (биты).
 */
'use strict';

const ST_CFG = {
  ping: {
    url: 'https://speed.cloudflare.com/__down?bytes=1000',
    tries: 6,          // замеров пинга
  },
  download: {
    url: 'https://speed.cloudflare.com/__down?bytes=25000000',  // 25 МБ чанк; качаем в цикле, пока идёт окно
    fallbackUrl: 'https://httpbin.org/stream-bytes/1048576',    // 1 МБ чанк (лимит httpbin), CORS
    windowMs: 9000,    // окно измерения
  },
  upload: {
    url: 'https://speed.cloudflare.com/__up',
    fallbackUrl: 'https://httpbin.org/post',
    chunk: 4 * 1024 * 1024,   // 4 МБ на POST
    streams: 4,               // параллельные потоки
    windowMs: 9000,
  },
};

const ST = { ping: null, jitter: null, download: null, upload: null };
let stRunning = false;

const mbps = (bytes, ms) => (bytes * 8) / (ms / 1000) / 1e6;

function randomChunk(size) {
  const buf = new Uint8Array(size);
  for (let off = 0; off < size; off += 65536) {
    crypto.getRandomValues(buf.subarray(off, Math.min(off + 65536, size)));
  }
  return buf;
}

/* ---------- Ping ---------- */
async function stPing(onTick, signal) {
  const times = [];
  // прогрев (TLS-рукопожатие не считаем)
  try { await fetch(ST_CFG.ping.url, { cache: 'no-store', signal }); } catch (e) {}
  for (let i = 0; i < ST_CFG.ping.tries; i++) {
    if (signal.aborted) return null;
    const t0 = performance.now();
    try {
      const res = await fetch(ST_CFG.ping.url, { cache: 'no-store', signal });
      await res.arrayBuffer();
      times.push(performance.now() - t0);
      onTick(Math.min(...times));
    } catch (e) { /* пропускаем */ }
  }
  if (!times.length) return null;
  const min = Math.min(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  ST.jitter = times.length > 1
    ? times.reduce((a, t, i) => i ? a + Math.abs(t - times[i - 1]) : 0, 0) / (times.length - 1)
    : 0;
  return min;
}

/* ---------- Download ---------- */
async function stDownload(url, onTick, signal) {
  const t0 = performance.now();
  const deadline = t0 + ST_CFG.download.windowMs;
  let bytes = 0;
  try {
    // Не один длинный запрос, а чанки до конца окна: так быстрый канал не упирается
    // в лимит размера ответа Cloudflare (крупные bytes= возвращают 403).
    while (!signal.aborted && performance.now() < deadline) {
      const res = await fetch(url, { cache: 'no-store', signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || signal.aborted) break;
          bytes += value.length;
          const now = performance.now();
          onTick(mbps(bytes, now - t0));
          if (now >= deadline) { try { await reader.cancel(); } catch (e) {} break; }
        }
      } finally { try { reader.releaseLock(); } catch (e) {} }
    }
  } catch (e) {
    if (!bytes) throw e; // если часть данных уже получена, отдаём измеренную скорость
  }
  const ms = performance.now() - t0;
  return bytes > 0 ? mbps(bytes, ms) : null;
}

/* ---------- Upload ---------- */
async function stUpload(url, chunkSize, onTick, signal) {
  const chunk = randomChunk(chunkSize);
  const t0 = performance.now();
  const deadline = t0 + ST_CFG.upload.windowMs;
  let bytes = 0;
  const worker = async () => {
    while (!signal.aborted && performance.now() < deadline) {
      const res = await fetch(url, { method: 'POST', body: chunk, cache: 'no-store', signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await res.arrayBuffer().catch(() => {});
      bytes += chunk.length;
      onTick(mbps(bytes, performance.now() - t0));
    }
  };
  await Promise.all(Array.from({ length: ST_CFG.upload.streams }, () => worker()));
  const ms = performance.now() - t0;
  return bytes > 0 ? mbps(bytes, ms) : null;
}

/* ---------- UI ---------- */
const stEl = id => document.getElementById(id);

function stTile(id, label, icon) {
  return `<div class="speedtest-item" id="tile-${id}">
    <div class="speedtest-icon">${icon}</div>
    <div class="speedtest-info">
      <div class="speedtest-label">${label}</div>
      <div class="speedtest-value" id="sp-${id}">—</div>
      <div class="speedtest-sub" id="sp-${id}-sub"></div>
    </div>
  </div>`;
}

function stRenderShell() {
  const c = stEl('speedtest-results');
  if (c && !c.children.length) {
    c.innerHTML =
      stTile('ping', 'Ping', '📡') +
      stTile('download', 'Скачивание', '⬇️') +
      stTile('upload', 'Загрузка', '⬆️');
  }
}

function stSet(id, val, unit, sub) {
  const el = stEl('sp-' + id);
  if (el) el.innerHTML = val == null ? '<span class="speedtest-na">н/д</span>'
    : `${val.toFixed(1)} <span class="speedtest-unit">${unit}</span>`;
  if (sub != null) { const s = stEl('sp-' + id + '-sub'); if (s) s.textContent = sub; }
}

function stStatus(t) { const el = stEl('st-status'); if (el) el.textContent = t; }

/* ---------- Запуск ---------- */
async function runSpeedtest() {
  if (stRunning) return;
  stRunning = true;
  const btn = stEl('btn-speedtest-run');
  const ctl = new AbortController();
  window._stAbort = ctl;
  const timeout = setTimeout(() => ctl.abort(), 60000);
  stRenderShell();
  ['ping', 'download', 'upload'].forEach(id => stSet(id, null, '', ''));
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Тестируем…'; }

  try {
    // 1. Ping
    stStatus('Измеряем ping…');
    ST.ping = await stPing(v => stSet('ping', v, 'мс'), ctl.signal);
    if (ST.ping == null) stSet('ping', null);
    else stSet('ping', ST.ping, 'мс', ST.jitter ? `джиттер ${ST.jitter.toFixed(0)} мс` : '');

    // 2. Download
    stStatus('Измеряем скачивание…');
    try {
      ST.download = await stDownload(ST_CFG.download.url, v => stSet('download', v, 'Мбит/с'), ctl.signal);
    } catch (e) {
      try { ST.download = await stDownload(ST_CFG.download.fallbackUrl, v => stSet('download', v, 'Мбит/с'), ctl.signal); }
      catch (e2) { ST.download = null; }
    }
    if (ST.download == null) stSet('download', null); else stSet('download', ST.download, 'Мбит/с');

    // 3. Upload
    stStatus('Измеряем загрузку…');
    try {
      ST.upload = await stUpload(ST_CFG.upload.url, ST_CFG.upload.chunk, v => stSet('upload', v, 'Мбит/с'), ctl.signal);
    } catch (e) {
      try { ST.upload = await stUpload(ST_CFG.upload.fallbackUrl, 2 * 1024 * 1024, v => stSet('upload', v, 'Мбит/с'), ctl.signal); }
      catch (e2) { ST.upload = null; }
    }
    if (ST.upload == null) stSet('upload', null); else stSet('upload', ST.upload, 'Мбит/с');

    const any = ST.ping != null || ST.download != null || ST.upload != null;
    stStatus(any ? '✓ Тест завершён' : '❌ Не удалось провести тест — проверьте подключение');
  } catch (e) {
    stStatus(ctl.signal.aborted ? '⏱ Превышено время теста' : '❌ Ошибка: ' + (e.message || e));
  } finally {
    clearTimeout(timeout);
    stRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = '▶ Запустить тест ещё раз'; }
  }
}

function stReset() {
  ST.ping = ST.jitter = ST.download = ST.upload = null;
  stRenderShell();
  ['ping', 'download', 'upload'].forEach(id => { stSet(id, null, '', ''); });
  stStatus('Готов к тесту');
}

function initSpeedtest() {
  stRenderShell();
  stStatus('Готов к тесту');
  const run = stEl('btn-speedtest-run');
  if (run) run.addEventListener('click', runSpeedtest);
  const reset = stEl('btn-speedtest-reset');
  if (reset) reset.addEventListener('click', stReset);
}

document.addEventListener('DOMContentLoaded', initSpeedtest);
