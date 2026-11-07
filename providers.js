// Список публичных бесплатных DNS-серверов.
// cat: ga=универсальный, adblock=блокировка рекламы/трекеров, family=семейный, privacy=приватность, asia/ru/eu=региональные
// doh: URL DNS-over-HTTPS (RFC8484, wireformat через ?dns=...), json: URL в JSON-формате (Cloudflare/Google style)
// Если doh=null — из браузера протестировать нельзя (нет DoH/нет CORS), показываем только настройки для роутера.
window.PROVIDERS = [
  // ---------- Универсальные (без фильтрации) ----------
  {
    id: 'cloudflare', name: 'Cloudflare', cat: 'ga', geo: 'global',
    desc: 'Один из самых известных глобальных публичных резолверов; не фильтрует контент по умолчанию',
    ipv4: ['1.1.1.1', '1.0.0.1'], ipv6: ['2606:4700:4700::1111', '2606:4700:4700::1001'],
    doh: 'https://1.1.1.1/dns-query', json: 'https://1.1.1.1/dns-query', jsonStamp: '1.1.1.1',
    dot: 'one.one.one.one', site: 'https://1.1.1.1/',
    routerNote: 'Часто операторы дешёвых сетей «режут» трафик до 1.1.1.1 — если тест не прошёл, попробуйте через DoT.',
  },
  {
    id: 'google', name: 'Google Public DNS', cat: 'ga', geo: 'global',
    desc: 'Крупнейший публичный резолвер, стабильно работает почти во всех странах (в РФ иногда с задержками)',
    catNote: 'Плюс: самые надёжные ответы. Минус: Google собирает данные о запросах',
    ipv4: ['8.8.8.8', '8.8.4.4'], ipv6: ['2001:4860:4860::8888', '2001:4860:4860::8844'],
    doh: 'https://dns.google/dns-query', json: 'https://dns.google/resolve', jsonName: true,
    dot: 'dns.google', site: 'https://developers.google.com/speed/public-dns',
  },
  {
    id: 'quad9', name: 'Quad9 (9.9.9.9)', cat: 'ga', geo: 'global',
    desc: 'Некоммерческая швейцарская организация, блокирует вредоносные домены, не передаёт данные третьим лицам',
    ipv4: ['9.9.9.9', '149.112.112.112'], ipv6: ['2620:fe::fe', '2620:fe::9'],
    doh: 'https://dns.quad9.net/dns-query', dot: 'dns.quad9.net', site: 'https://www.quad9.net/',
  },
  {
    id: 'quad9-unfiltered', name: 'Quad9 без фильтрации (9.9.9.10)', cat: 'privacy', geo: 'global',
    desc: 'Quad9 Unsecured (официальные IP/DoT адреса). DoH endpoint dns10.quad9.net/dns-query дважды завершился таймаутом в наших проверках; это не доказывает, что сам UDP/DoT сервис недоступен.',
    ipv4: ['9.9.9.10', '149.112.112.10'], ipv6: ['2620:fe::10', '2620:fe::fe:10'],
    doh: null, dot: 'dns10.quad9.net', site: 'https://www.quad9.net/',
  },
  {
    id: 'adguard', name: 'AdGuard DNS', cat: 'ga', geo: 'global',
    desc: 'Универсальный без фильтрации (это НЕ фильтрующий AdGuard — основной офис в ЕС, серверы по всему миру)',
    routerNote: 'Фильтрующий вариант см. ниже в категории «Блокировка рекламы».',
    ipv4: ['94.140.14.140', '94.140.14.141'], ipv6: ['2a10:50c0::1:ff', '2a10:50c0::2:ff'],
    doh: 'https://unfiltered.adguard-dns.com/dns-query', json: 'https://unfiltered.adguard-dns.com/resolve', jsonName: true,
    dot: 'unfiltered.adguard-dns.com', site: 'https://adguard-dns.io/ru/public-dns.html',
  },
  {
    id: 'dnssb', name: 'DNS.sb', cat: 'privacy', geo: 'eu',
    desc: 'Немецко-сингапурский резолвер, без логов, нейтральное позиционирование («under the radar»)',
    ipv4: ['185.222.222.222', '45.11.45.11'], ipv6: ['2a09::', '2a11::'],
    doh: 'https://doh.dns.sb/dns-query', json: 'https://doh.dns.sb/dns-query', wireGetJson: true,
    dot: 'dot.dns.sb', site: 'https://dns.sb/',
  },
  {
    id: 'controld', name: 'Control D (Free @ p0)', cat: 'privacy', geo: 'global',
    desc: 'Бесплатный безфильтровый профиль p0 от Control D (Rendezvous anycast, нет логов запросов)',
    ipv4: ['76.76.2.0', '76.76.10.0'], ipv6: ['2606:1a40::', '2606:1a40:1::'],
    doh: 'https://freedns.controld.com/p0', dot: 'p0.freedns.controld.com', site: 'https://controld.com/',
  },
  {
    id: 'nextdns', name: 'NextDNS (нужен ID профиля)', cat: 'privacy', geo: 'global',
    desc: 'Персональный сервис DNS-фильтрации. Универсального публичного профиля без ID нет; для теста добавьте личный DoH URL через «Своя DoH-ссылка».',
    routerNote: 'Создайте конфигурацию на nextdns.io и используйте ваш персональный DoH/DoT адрес. Без ID профиля общий dns.nextdns.io не тестируется.',
    ipv4: [], ipv6: [],
    doh: null, json: null, dot: null, site: 'https://nextdns.io/',
  },
  {
    id: 'mullvad', name: 'Mullvad Public DNS', cat: 'privacy', geo: 'eu',
    desc: 'Шведский VPN-бренд, публичный резолвер без логов, только DoH/DoT (plain UDP тоже работает на 194.242.2.2)',
    ipv4: ['194.242.2.2'], ipv6: [],
    doh: 'https://dns.mullvad.net/dns-query', dot: 'dns.mullvad.net', site: 'https://mullvad.net/en/help/dns-over-https-and-dns-over-tls/',
  },
  {
    id: 'libredns', name: 'LibreDNS', cat: 'privacy', geo: 'eu',
    desc: 'Греческий open-source резолвер, без логов',
    ipv4: ['116.202.176.26'], ipv6: ['2a01:4f8:1c1c:8283::1'],
    doh: 'https://doh.libredns.gr/dns-query', dot: 'dot.libredns.gr', site: 'https://libredns.gr/',
  },
  {
    id: 'dg', name: 'Digitale Gesellschaft', cat: 'privacy', geo: 'eu',
    desc: 'Швейцарская цифровая организация, без логов',
    ipv4: ['185.95.218.42', '185.95.218.43'], ipv6: ['2a05:fc84::42', '2a05:fc84::43'],
    doh: 'https://dns.digitale-gesellschaft.ch/dns-query', dot: 'dns.digitale-gesellschaft.ch', site: 'https://www.digitale-gesellschaft.ch/dns/',
  },

  // ---------- Блокировка рекламы / трекеров ----------
  {
    id: 'adguard-ad', name: 'AdGuard Default (реклама+трекеры)', cat: 'adblock', geo: 'global',
    desc: 'Блокирует рекламу и трекеры,Child-фильтра нет. Мощные сети, работает в РФ.',
    ipv4: ['94.140.14.14', '94.140.15.15'], ipv6: ['2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'],
    doh: 'https://dns.adguard-dns.com/dns-query', json: 'https://dns.adguard-dns.com/resolve', jsonName: true,
    dot: 'dns.adguard-dns.com', site: 'https://adguard-dns.io/ru/public-dns.html',
  },
  {
    id: 'cffamily', name: 'Cloudflare Family 1.1.1.3', cat: 'family', geo: 'global',
    desc: 'Malware + adult контент (YouTube SafeSearch и т.п.)',
    ipv4: ['1.1.1.3', '1.0.0.3'], ipv6: ['2606:4700:4700::1113', '2606:4700:4700::1003'],
    doh: 'https://family.cloudflare-dns.com/dns-query', dot: 'family.cloudflare-dns.com', site: 'https://one.one.one.one/family/',
  },
  {
    id: 'quad9-family', name: 'Quad9 Family 9.9.9.11', cat: 'family', geo: 'global',
    desc: 'Вредоносные + adult домены, DNSSEC, приватность',
    ipv4: ['9.9.9.11', '149.112.112.11'], ipv6: ['2620:fe::11', '2620:fe::fe:11'],
    doh: 'https://dns11.quad9.net/dns-query', dot: 'dns11.quad9.net', site: 'https://www.quad9.net/',
  },
  {
    id: 'adguard-family', name: 'AdGuard Family', cat: 'family', geo: 'global',
    desc: 'Реклама + взрослый контент + Child-режим SafeSearch',
    ipv4: ['94.140.14.15', '94.140.15.16'], ipv6: ['2a10:50c0::bad1:ff', '2a10:50c0::bad2:ff'],
    doh: 'https://family.adguard-dns.com/dns-query', dot: 'family.adguard-dns.com', site: 'https://adguard-dns.io/ru/public-dns.html',
  },
  {
    id: 'cleanbrowsing', name: 'CleanBrowsing Security', cat: 'family', geo: 'global',
    desc: 'Фильтр вредоносных/мошеннических доменов, бесплатный тариф',
    ipv4: ['185.228.168.9', '185.228.169.9'], ipv6: ['2a0d:2a00:1::2', '2a0d:2a00:2::2'],
    doh: 'https://doh.cleanbrowsing.org/doh/security-filter/', dot: 'security-filter-dns.cleanbrowsing.org', site: 'https://cleanbrowsing.org/',
  },
  {
    id: 'opendns', name: 'OpenDNS Home (стандартный)', cat: 'ga', geo: 'global',
    desc: 'Стандартный публичный резолвер Cisco/OpenDNS. Фильтрация настраивается через профиль OpenDNS; сами эти IP не являются FamilyShield.',
    ipv4: ['208.67.222.222', '208.67.220.220'], ipv6: ['2620:119:35::35', '2620:119:53::53'],
    doh: 'https://doh.opendns.com/dns-query', dot: 'doh.opendns.com', site: 'https://www.opendns.com/',
    routerNote: 'DoH отвечает, но не возвращает CORS для браузера; прямой DNS и DoT можно настраивать отдельно.',
  },
  {
    id: 'opendns-familyshield', name: 'OpenDNS FamilyShield', cat: 'family', geo: 'global',
    desc: 'Преднастроенный семейный резолвер OpenDNS: фильтр взрослого контента. DoH для браузерного теста не заявлен.',
    ipv4: ['208.67.222.123', '208.67.220.123'], ipv6: [],
    doh: null, site: 'https://www.opendns.com/setupguide/',
  },

  // ---------- Региональные ----------
  {
    id: 'yandex', name: 'Яндекс DNS', cat: 'ru', geo: 'ru',
    desc: 'Точки в РФ, быстрые для российских сайтов; Safe 77.88.8.88 блокирует вирусы, Family 77.88.8.7 — «взрослые» сайты',
    ipv4: ['77.88.8.8', '77.88.8.1'], ipv6: ['2a02:6b8::feed:0ff', '2a02:6b8:0:1::feed:0ff'],
    doh: null, dot: 'common.dot.dns.yandex.net', site: 'https://dns.yandex.ru/',
    routerNote: 'Яндекс не открывает DoH с CORS, поэтому из браузера проверить скорость нельзя — ставьте через UDP/DoT и проверяйте по ощущениям или через ping на ПК.',
  },
  {
    id: 'alidns', name: 'AliDNS (Alibaba)', cat: 'asia', geo: 'cn',
    desc: 'Быстрый в Китае и Юго-Восточной Азии',
    ipv4: ['223.5.5.5', '223.6.6.6'], ipv6: ['2400:3200::1', '2400:3200:baba::1'],
    doh: 'https://dns.alidns.com/dns-query', json: 'https://dns.alidns.com/resolve', jsonName: true,
    dot: 'dns.alidns.com', site: 'https://alidns.com/',
  },
  {
    id: 'dnspod', name: 'DNSPod (Tencent)', cat: 'asia', geo: 'cn',
    desc: 'Быстрый в Китае, стабильный',
    ipv4: ['119.29.29.29', '182.254.116.116'], ipv6: [],
    doh: 'https://doh.pub/dns-query', dot: 'dot.pub', site: 'https://www.dnspod.cn/',
  },
  {
    id: 'd114', name: '114DNS', cat: 'asia', geo: 'cn',
    desc: 'Китайский публичный DNS (Сик Чен network), тест из браузера недоступен (нет DoH)',
    ipv4: ['114.114.114.114', '114.114.115.115'], ipv6: [], doh: null, site: 'https://www.114dns.com/',
  },
  {
    id: 'cira', name: 'CIRA Canadian Shield', cat: 'na', geo: 'na',
    desc: 'Канадский (для Северной Америки), фильтрует вредоносные',
    ipv4: ['149.112.121.10', '149.112.122.10'], ipv6: ['2620:10a:500b::', '2620:10a:500c::'],
    doh: 'https://private.canadianshield.cira.ca/dns-query', dot: 'private.canadianshield.cira.ca', site: 'https://www.cira.ca/cybersecurity-services/canadian-shield/',
  },
  {
    id: 'dnswatch', name: 'DNS.WATCH', cat: 'eu', geo: 'eu',
    desc: 'Немецкий без логов и фильтров (медленный uptime, но приватный); тест из браузера недоступен',
    ipv4: ['84.200.69.80', '84.200.70.40'], ipv6: ['2001:1608:10:25::1c04:b12f', '2001:1608:10:25::9249:d69b'],
    doh: null, site: 'https://dns.watch/',
  },
  {
    id: 'verisign', name: 'Verisign', cat: 'na', geo: 'us',
    desc: 'Корневой оператор .com/.net, стабильный в США; тест из браузера недоступен (нет публичного DoH)',
    ipv4: ['64.6.64.6', '64.6.65.6'], ipv6: ['2620:74:1b::1:1', '2620:74:1c::2:2'],
    doh: null, site: 'https://www.verisign.com/en_US/domain-name-services/public-dns/index.xhtml',
  },
  {
    id: 'comodo', name: 'Comodo Secure DNS', cat: 'na', geo: 'us',
    desc: 'Фильтрует вредоносные; тест из браузера недоступен (нет публичного DoH)',
    ipv4: ['8.26.56.26', '8.20.247.20'], ipv6: [], doh: null, site: 'https://dns.comodo.com/',
  },
  {
    id: 'he', name: 'Hurricane Electric (he.net)', cat: 'privacy', geo: 'global',
    desc: 'Легендарная сеть хостинга, без фильтров, без логов; тест из браузера недоступен (нет DoH)',
    ipv4: ['74.82.42.42'], ipv6: ['2001:470:20::2'], doh: null, site: 'https://he.net/',
  },
  // Категории-подсказки
];

window.CATS = [
  { id: 'ga',      label: 'Универсальные (без фильтрации)' },
  { id: 'privacy', label: 'Приватность / без логов' },
  { id: 'adblock', label: 'Блокировка рекламы' },
  { id: 'family',  label: 'Семейные (родительский контроль)' },
  { id: 'ru',      label: 'Россия' },
  { id: 'asia',    label: 'Азия / Китай' },
  { id: 'eu',      label: 'Европа (прочее)' },
  { id: 'na',      label: 'Северная Америка' },
];
