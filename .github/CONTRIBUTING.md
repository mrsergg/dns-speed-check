# Contributing

Thanks for taking a look at the project. It is a dependency-free static site: plain HTML, CSS and browser JavaScript, with no build step.

## Before you change code

- Run `npm ci` once, then `npm test` — the offline suite covers publishing rules, UI behaviour, header IP/location fallbacks and the DNS-info DOM flow.
- Live checks (`npm run test:dns`, `node dev/fullrun.js`) make real DNS requests; results depend on your network and region.
- Do not commit `node_modules/`, `_site/`, logs or `.env` files. The Pages workflow publishes only an explicit allowlist of static assets.

## Guidelines

- Keep the site backend-free: everything must work when served as static files (including from a subpath such as `https://<owner>.github.io/<repo>/`).
- If you change what data is sent to third parties, update `legal.html`, the privacy section of `README.md` and `THIRD-PARTY-NOTICES.md` in the same change.
- Keep the DNS provider list factual; it is a curated directory, not a popularity ranking.
- Do not add trackers, analytics or requests to a project-owned backend.

## Reporting issues

Include your browser, OS, region/VPN state, the resolver being tested and the exact error text from the browser console. DNS, CORS and DNSSEC results are network-dependent, so a failing resolver may be blocked locally rather than broken globally.

## License

Contributions are accepted under the project license, GNU AGPL-3.0 (see `LICENSE` and `NOTICE`).
