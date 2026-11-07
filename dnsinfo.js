/* On-demand dnscheck.tools-inspired connection information */
(() => {
  const $ = id => document.getElementById(id);
  const q = selector => document.querySelector(selector);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  const setStatus = text => { $('dnsInfoStatus').textContent = text; };
  const renderIpList = (target, rows, emptyText) => {
    target.innerHTML = rows.length ? rows.map(row => `<article class="dnsinfo-row"><strong>${escapeHtml(row.owner || 'Неизвестная сеть')}</strong><code>${escapeHtml(row.ip)}</code><span>${row.ptr ? `ptr: ${escapeHtml(row.ptr)}` : row.ns ? `ns: ${escapeHtml(row.ns)}` : ''}</span><span>${escapeHtml(row.geo || '')}</span></article>`).join('') : `<p class="hint">${escapeHtml(emptyText)}</p>`;
  };

  async function ipDetails(ip) {
    const detail = { ip };
    try {
      const [ipRes, ptrRes, geoRes] = await Promise.allSettled([
        fetch(`https://ip.addr.tools/${encodeURIComponent(ip)}`, { cache:'no-store' }).then(r => r.ok ? r.json() : null),
        fetch(`https://addr.tools/dns/${encodeURIComponent(reverseZone(ip))}/ptr`, { cache:'no-store' }).then(r => r.ok ? r.json() : null),
        fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { cache:'no-store' }).then(r => r.ok ? r.json() : null),
      ]);
      const info = ipRes.status === 'fulfilled' ? ipRes.value : null;
      const geo = geoRes.status === 'fulfilled' ? geoRes.value : null;
      if (geo?.success) {
        detail.owner = geo.connection?.isp || geo.connection?.org || info?.org || (info?.asn && `AS${info.asn}`);
        detail.geo = [geo.city, geo.region, geo.country_code].filter(Boolean).join(', ');
      } else if (info) detail.owner = info.org || (info.asn && `AS${info.asn}`);
      const ptrJson = ptrRes.status === 'fulfilled' ? ptrRes.value : null;
      const ptr = ptrJson?.Answer?.find(a => a.type === 12)?.data?.replace(/\.$/, '');
      if (ptr) detail.ptr = ptr;
    } catch (_) {}
    return detail;
  }

  function reverseZone(ip) {
    if (ip.includes(':')) {
      const hex = ip.split('::');
      const left = hex[0] ? hex[0].split(':') : [];
      const right = hex[1] ? hex[1].split(':') : [];
      const groups = [...left, ...Array(Math.max(0,8-left.length-right.length)).fill('0'), ...right].map(x => x.padStart(4,'0'));
      return groups.join('').split('').reverse().join('.') + '.ip6.arpa';
    }
    return ip.split('.').reverse().join('.') + '.in-addr.arpa';
  }

  const probe = async (fqdn, timeout = 9000, signal) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) return false;
    signal?.addEventListener('abort', abort, { once:true });
    const timer = setTimeout(abort, timeout);
    try {
      const r = await fetch(`https://${fqdn}/`, { signal:controller.signal, cache:'no-store' });
      return r.ok;
    } catch (_) { return false; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };

  const measureDnsLatency = async (count = 5) => {
    const samples = [];
    for (let i = 0; i < count; i++) {
      const label = Math.random().toString(36).slice(2, 12);
      const fqdn = `dns-latency-${Date.now().toString(36)}-${label}.null-addr.com`;
      const start = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try { await fetch(`https://${fqdn}/`, { signal:controller.signal, cache:'no-store' }); }
      catch (_) {}
      finally { clearTimeout(timer); samples.push(performance.now() - start); }
    }
    if (!samples.length) return null;
    return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  };

  async function runDnsInfo() {
    const btn = $('btnDnsInfo');
    if (btn.disabled) return;
    btn.disabled = true;
    $('dnsInfoResults').classList.remove('hidden');
    $('dnsInfoClient').innerHTML = '<p class="hint">Определяем публичные IP-адреса…</p>';
    $('dnsInfoResolvers').innerHTML = '<p class="hint">Отправляем контрольные DNS-запросы…</p>';
    $('dnsInfoLatency').textContent = 'Измеряем…';
    $('dnsInfoSummary').textContent = '';
    document.querySelectorAll('[data-dnssec]').forEach(cell => { cell.textContent = '…'; cell.className = 'pending'; });
    setStatus('Идёт тест. Запросы к dnscheck.tools и addr.tools выполняются только по нажатию.');

    const clientIPs = new Set();
    const resolvers = new Map();
    const clientId = (crypto.getRandomValues(new Uint32Array(1))[0]).toString(16);
    const controller = new AbortController();
    let socket;
    const resolverMessages = [];
    let watcherError = false;
    try {
      const latencyPromise = measureDnsLatency(5);
      const ipPromises = ['https://myipv4.addr.tools/plain','https://myipv6.addr.tools/plain'].map(async url => {
        try {
          const response = await fetch(url, { cache:'no-store', signal:controller.signal });
          if (response.ok) { const ip = (await response.text()).trim(); if (ip) clientIPs.add(ip); }
        } catch (_) {}
      });

      const socketPromise = new Promise(resolve => {
        let settled = false;
        let timer = null;
        const finish = () => { if (!settled) { settled = true; if (timer) clearTimeout(timer); resolve(); } };
        try {
          socket = new WebSocket(`wss://ws.dnscheck.tools/watch/${clientId}`);
          timer = setTimeout(() => { try { socket.close(); } catch (_) {} finish(); }, 25000);
          socket.addEventListener('open', async () => {
            for (let i=0; i<4; i++) await probe(`${String.fromCharCode(97+i)}.${clientId}-nullip.test.dnscheck.tools`, 9000, controller.signal);
            if (controller.signal.aborted) { clearTimeout(timer); finish(); return; }
            await probe(`${clientId}-nullip.test-ipv6.dnscheck.tools`, 9000, controller.signal);
            const algorithms = ['alg13','alg14','alg15','alg18'];
            const labels = ['ECDSA P-256','ECDSA P-384','Ed25519','ML-DSA-44'];
            const tests = ['valid','bad','expired','missing'];
            for (let ai=0; ai<algorithms.length; ai++) {
              if (controller.signal.aborted) break;
              const valid = await probe(`${clientId}.test-${algorithms[ai]}.dnscheck.tools`, 9000, controller.signal);
              const validCell = q(`[data-dnssec="valid-${ai}"]`);
              validCell.textContent = valid ? 'PASS' : 'ERR'; validCell.className = valid ? 'dns-pass' : 'dns-error';
              if (!valid) {
                for (const kind of tests.slice(1)) { const c=q(`[data-dnssec="${kind}-${ai}"]`); c.textContent='н/д'; c.className='dns-na'; }
                continue;
              }
              const options = ['badsig','expiredsig','nosig'];
              const names = ['bad','expired','missing'];
              await Promise.all(options.map(async (option, oi) => {
                const connected = await probe(`${clientId}-${option}.test-${algorithms[ai]}.dnscheck.tools`, 20000, controller.signal);
                const cell = q(`[data-dnssec="${names[oi]}-${ai}"]`);
                if (option === 'nosig') {
                  // Валидатор должен отвергнуть unsigned-зону: соединение = FAIL*, отказ = PASS (в оригинале FAIL* жёлтый).
                  cell.textContent = connected ? 'FAIL*' : 'PASS'; cell.className = connected ? 'dns-warn' : 'dns-pass';
                } else {
                  cell.textContent = connected ? 'FAIL' : 'PASS'; cell.className = connected ? 'dns-fail' : 'dns-pass';
                }
              }));
            }
            clearTimeout(timer); finish();
          });
          socket.addEventListener('message', event => {
            try {
              const message = JSON.parse(event.data);
              if (message.remoteIp) { resolvers.set(message.remoteIp, message); resolverMessages.push(message); }
            } catch (_) {}
          });
          socket.addEventListener('error', () => { watcherError = true; finish(); });
          socket.addEventListener('close', event => { if (!resolverMessages.length && event.code !== 1000) watcherError = true; finish(); });
        } catch (_) { finish(); }
      });

      await Promise.all([socketPromise, Promise.all(ipPromises)]);
      controller.abort();
      if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000);
      setStatus('Обогащаем результаты PTR, организацией и географией…');
      const clientRows = await Promise.all([...clientIPs].map(ipDetails));
      const resolverRows = await Promise.all([...resolvers.keys()].map(ipDetails));
      const latency = await latencyPromise;
      $('dnsInfoLatency').textContent = latency == null ? 'н/д' : `${latency} мс`;
      if (watcherError && !resolverRows.length) {
        document.querySelectorAll('[data-dnssec]').forEach(cell => { cell.textContent='н/д'; cell.className='dns-na'; });
      }
      renderIpList($('dnsInfoClient'), clientRows, 'Публичные IP не удалось определить. IPv6 может отсутствовать в сети.');
      renderIpList($('dnsInfoResolvers'), resolverRows, 'Резолверы не обнаружены. Проверьте, что соединение с dnscheck.tools не блокируется сетью.');
      const valid = document.querySelectorAll('[data-dnssec^="valid-"]');
      const passValid = [...valid].filter(cell => cell.textContent === 'PASS').length;
      $('dnsInfoSummary').innerHTML = `<strong>Сводка:</strong> обнаружено DNS-резолверов: ${resolverRows.length}; DNSSEC: ${watcherError && !resolverRows.length ? 'не удалось проверить (dnscheck.tools недоступен)' : `доступно ${passValid}/4 алгоритмов`}. ${resolverMessages.some(m => m.isEdns0) ? 'EDNS: обнаружен.' : ''} ${resolverMessages.some(m => m.remoteIp?.includes(':')) ? 'DNS-запросы пришли по IPv6.' : ''}`;
      setStatus(watcherError && !resolverRows.length ? 'IP проверен; DNS-детекция недоступна из этой сети.' : 'Тест завершён.');
    } catch (error) {
      controller.abort();
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
      setStatus(`Не удалось завершить тест: ${error.message || error}`);
    } finally { btn.disabled = false; }
  }

  document.addEventListener('DOMContentLoaded', () => $('btnDnsInfo')?.addEventListener('click', runDnsInfo));
})();
