# DNS Тестер & Speedtest

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Tests](https://github.com/mrsergg/dns-speed-check/actions/workflows/tests.yml/badge.svg)](https://github.com/mrsergg/dns-speed-check/actions/workflows/tests.yml)
[![Deploy](https://github.com/mrsergg/dns-speed-check/actions/workflows/pages.yml/badge.svg)](https://github.com/mrsergg/dns-speed-check/actions/workflows/pages.yml)

**Сайт:** https://mrsergg.github.io/dns-speed-check/

![DNS Тестер & Speedtest](social-preview.png)

Браузерный тест публичных DNS-серверов и скорости интернета. Без установки, регистрации и бэкенда: открыли страницу — проверили.

## Что умеет

- Проверяет 27 публичных DoH-серверов: задержка, подключение, ошибки, корректность ответов.
- Проверяет DNSSEC и блокировку рекламы.
- Показывает внешний IP, провайдера и примерный город при открытии страницы.
- По кнопке «Определить информацию» находит DNS-резолверы, PTR и организацию, проверяет DNSSEC по алгоритмам и измеряет задержку DNS.
- Speedtest: ping, скачивание, загрузка.
- Фильтры, сортировка, экспорт CSV, добавление своего DoH-сервера.

## Локальный запуск

Сайт статический — подойдёт любой файловый сервер:

```sh
npx http-server . -p 8484
# или
python -m http.server 8484
```

Откройте <http://localhost:8484/>. Для DoH и WebSocket нужен HTTPS или `localhost`.

## Тесты

```sh
npm ci
npm test
```

`npm test` — офлайн-проверки публикации, интерфейса, шапки и dnsinfo. Живые запросы к DNS: `npm run test:dns`.

## Публикация

Сайт собирается workflow `.github/workflows/pages.yml` и публикуется на GitHub Pages. В настройках репозитория: **Settings → Pages → Source: GitHub Actions**. В артефакт попадают только статические файлы.

## Приватность

Запросы идут из браузера напрямую: к выбранным DNS-серверам, к `ipwho.is` / `ipapi.co` / `ipinfo.io` (IP и город), к `dnscheck.tools` и `addr.tools` (по кнопке), к Cloudflare и httpbin (speedtest). Результаты никуда не отправляются. Подробнее — в [legal.html](legal.html) и [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Лицензия

GNU AGPL-3.0 — см. [LICENSE](LICENSE) и [NOTICE](NOTICE). Методика DNS-теста вдохновлена проектом [addr.tools](https://github.com/brianshea2/addr.tools) (AGPL-3.0).
