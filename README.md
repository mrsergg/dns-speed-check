# DNS Tester & Internet Speed Test

**Live demo:** <https://mrsergg.github.io/dns-speed-check/>

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Tests](https://github.com/mrsergg/dns-speed-check/actions/workflows/tests.yml/badge.svg)](https://github.com/mrsergg/dns-speed-check/actions/workflows/tests.yml)
[![Deploy](https://github.com/mrsergg/dns-speed-check/actions/workflows/pages.yml/badge.svg)](https://github.com/mrsergg/dns-speed-check/actions/workflows/pages.yml)
[![No backend](https://img.shields.io/badge/backend-none-lightgrey.svg)](#architecture)

A single-page, browser-only tool that tests public DNS resolvers and your internet speed. No backend, no accounts, no build step — it is plain HTML/CSS/JS and is published to GitHub Pages from this repository.

## Features

**DNS resolver test**
- Tests 27 curated public DoH resolvers (Cloudflare, Google, Quad9, AdGuard, Control D, Mullvad, Yandex, AliDNS and more) directly from your browser.
- Measures median/min latency, connection time and error rate, and checks answer correctness.
- DNSSEC check (`dnssec-failed.org`) and a limited ad-block check with a control query to Google Public DNS.
- Filter by category (universal, privacy, ad-block, family, region), sort columns, export results to CSV, add a custom HTTPS DoH endpoint.

**Connection & DNS information**
- Shows your public IPv4/IPv6, network owner and approximate location on page load.
- On demand, discovers the DNS resolvers your queries actually reach through the `dnscheck.tools` WebSocket watcher, with PTR/organisation/geo lookup.
- DNSSEC signature matrix (ECDSA P-256/P-384, Ed25519, ML-DSA-44) for valid, corrupted, expired and unsigned signatures, plus a system-DNS latency sample.

**Speed test**
- Ping, download and upload measured with browser requests to third-party endpoints, with automatic fallbacks.

## Architecture

Everything runs client-side:

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and cards |
| `style.css` | Dark theme, layout, responsive rules |
| `providers.js` | Curated resolver directory (data only) |
| `app.js` | DNS testing engine, UI, CSV export, background canvas |
| `speedtest.js` | Ping/download/upload measurement |
| `dnsinfo.js` | External IP, resolver discovery, DNSSEC matrix, latency |
| `legal.html` | License and privacy page |

DNS queries use the RFC 8484 DoH wire format (`?dns=<base64url>`) and the Google JSON API where available. GitHub Pages serves only these static files; `server.js` is a legacy convenience server for local use and is **not** deployed.

## Run locally

Any static server works — a secure context (HTTPS or `localhost`) is required for DoH and WebSocket features.

```sh
npx http-server . -p 8484
# or: python -m http.server 8484
```

Then open <http://localhost:8484/>.

A minimal Node server is included for convenience:

```sh
node server.js   # requires Node.js 18+
```

> `server.js` is not hardened for public/network exposure. Use it locally only.

## Tests

```sh
npm ci
npm test
```

`npm test` runs offline checks: static publishing rules, UI behaviour with a mocked DOM, header IP/location lookup fallbacks, and the DNS-info flow with mocked network. Optional live checks against real resolvers:

```sh
npm run test:dns     # node dev/smoke.js
node dev/fullrun.js  # full provider run, slower
```

Live endpoints can be blocked or rate-limited depending on your network and region.

## Deploy to GitHub Pages

GitHub Pages on the free plan requires a **public** repository. If **Settings → Pages** shows only a "Custom domain" block and no **Source** selector, the repository is still private (or Pages is disabled for it) — make the repository public first.

1. Create a **public** GitHub repository and push the source (`.gitignore` already excludes `node_modules/`, logs and local artifacts).
2. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab). `.github/workflows/pages.yml` runs the tests, copies an explicit allowlist of site files to `_site/`, replaces the `__SOURCE_URL__` placeholder with your repository URL, and deploys the artifact.
4. The site URL appears under **Settings → Pages** (usually `https://<owner>.github.io/<repo>/`).

Only the static site files are published: no `server.js`, tests, lockfiles or dev tooling.

## Suggested repository metadata

GitHub does not read these from files; paste them into the repository page (or apply with `gh repo edit`):

- **Description:** Browser-only DNS resolver tester and internet speed test — DNSSEC, ad-block check, resolver discovery. Static site for GitHub Pages, no backend.
- **Topics:** `dns`, `dnssec`, `doh`, `dns-over-https`, `speedtest`, `network-diagnostics`, `github-pages`, `vanilla-js`, `privacy`
- **Website:** the Pages URL after the first successful deploy.

## Privacy and network behavior

No results are sent to a server owned by this project. Requests go directly from your browser to:

- selected DoH resolvers (DNS tests);
- `ipwho.is` / `ipapi.co` / `ipinfo.io` on page load for the header IP and location (first working source wins);
- `dnscheck.tools`, `addr.tools` and `ipwho.is` when you press **Определить информацию** (sends test queries and your public IP);
- Google Public DNS as a control query in the ad-block check;
- fresh names under `null-addr.com` for the DNS-latency sample (resolved via your system DNS);
- Cloudflare (download/upload) and httpbin as speed-test fallbacks.

These operators may see your IP and network metadata. See [`legal.html`](legal.html) and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) for details.

## Limitations

Resolver availability, CORS, filtering, latency and DNSSEC results depend on your ISP, VPN, region and browser. A resolver that cannot be tested over browser DoH may still work over plain DNS or DoT. Results are a snapshot of one network path, not a global uptime or popularity ranking.

## License and attribution

Licensed under **GNU AGPL-3.0** — see [LICENSE](LICENSE) and [NOTICE](NOTICE). The DNS test methodology is inspired by [dnscheck.tools / addr.tools](https://github.com/brianshea2/addr.tools) (AGPL-3.0); this is an independent browser implementation, not the addr.tools server. OpenSpeedTest was consulted as an analysis reference only; its code is not included. All DNS provider names and marks belong to their owners; inclusion does not imply endorsement.

## Disclaimer

Experimental diagnostic utility, not a security certification or a guaranteed speed benchmark. Provided “as is”, without warranty; see the license.
