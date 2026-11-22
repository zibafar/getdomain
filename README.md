# getdomain: AI domain finder (.ir first)

**Live:** https://zibafar.github.io/getdomain/

getdomain is a static web app that runs entirely in your browser. It brainstorms brandable domain names with an AI model running on your own GPU, then checks every candidate against public registry data. There is no backend, no database, no account and no API key.

## Features

- **In-browser AI ([WebLLM](https://github.com/mlc-ai/web-llm))**
  - Generates about 30 names per search: creative, invented, Persian (Finglish), prefix/suffix and short-name styles.
  - Scores each name 0–100 on brandability, memorability, pronunciation, length, relevance and international use.
  - Model choice: Qwen 2.5 (0.5B / 1.5B / 3B), Llama 3.2 3B or Gemma 2 2B. Weights download once and stay cached in the browser.
  - Without WebGPU, the app falls back to clearly labelled keyword combinations.
- **Honest availability checks** with four statuses: Available, Registered, Premium, Unknown. See the provider table below.
- **.ir first**
  - Dedicated `.ir` filter, and `.ir` rows are highlighted on every card.
  - IRNIC naming rules are validated before any lookup.
  - Eligibility warnings on every `.ir` result.
  - A strip compares the same name across `.ir`, `.com`, `.net`, `.ai` and the other selected extensions.
- **Fast and cancellable**
  - Up to 8 concurrent lookups, with per-host rate limiting.
  - Live progress bar, and results stream in as they arrive.
  - Cancel at any time; recheck a single domain or every Unknown one.
- **Results tools:** filter by status or extension, sort by AI score / most available / name, copy one domain or all available ones, open a registrar or WHOIS link.
- **English and Persian:** full RTL layout and the Vazirmatn font. Responsive, with light and dark themes.

## How availability is decided (all from the browser)

The CORS behaviour below was verified in headless Chrome from a foreign origin on 2026-11-22.

| Provider | Used for | CORS | Can say AVAILABLE? | Reliability |
|---|---|---|---|---|
| **Registry RDAP** (IANA bootstrap → Verisign, PIR, Identity Digital, Google Registry, CentralNic…) | .com .net .org .io .ai .app .dev .xyz … | ✅ `*` | **Yes:** only on a 404 from the registry's own server (empty body or RDAP `errorCode: 404`) | Authoritative. 200 → Registered, but only when the body is a valid `domain` object matching the name. Premium/reserved pricing isn't visible. |
| **DNS-over-HTTPS** (Cloudflare, then Google) | `.ir`, TLDs without RDAP (`.co`, `.me`…), and fallback when RDAP fails | ✅ `*` | **Never** | NS records → Registered. NXDOMAIN → Unknown · "may be free", because a name can be registered without nameservers, on hold or reserved. |
| rdap.org | not used | ✅ | ✗ | An intermediary. It returns `404 "No RDAP service is available"` for `.ir` and `.co`, which a naive checker would misread as "available". |
| IRNIC WHOIS (port 43) / IRNIC EPP | not reachable | ❌ | n/a | Browsers can't open raw TCP; EPP needs reseller credentials. |
| whois.nic.ir / nic.ir web | link only | ❌ blocked | n/a | Opened in a new tab for manual confirmation. |

Never treated as availability: HTTP 403, 429 and 5xx, network errors, CORS failures, invalid or mismatched RDAP bodies, intermediary errors, DNS failures.

**.ir in short:** IRNIC publishes no RDAP and no browser-accessible API. A `.ir` name can therefore be confirmed **Registered** but never **Available** here. Absent names show **Unknown · may be free** with a link to whois.nic.ir.

**Premium:** no free, key-less, CORS-enabled registrar API reports premium pricing, so this status is never shown on GitHub Pages.

## Tech stack

Next.js 15 (App Router, `output: "export"`), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Lucide icons, Sonner, WebLLM (WebGPU + Web Worker), Vitest.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000/getdomain/
npm test             # unit tests
npm run test:live    # live registry/DNS/CORS tests (internet required)
npm run build        # static site in ./out
```

Requires Node ≥ 18.18. CI uses Node 20. To preview the production build under the same subpath:

```bash
mkdir -p /tmp/site && ln -sfn "$PWD/out" /tmp/site/getdomain && python3 -m http.server -d /tmp/site 8080
# open http://localhost:8080/getdomain/
```

To build for a different path (for example a custom domain at the root): `NEXT_PUBLIC_BASE_PATH= npm run build`.

AI needs a WebGPU browser: Chrome or Edge 113+, or recent Safari/Firefox with WebGPU enabled. The first run downloads the model (≈0.9–2.5 GB).

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` runs on every push to `main`, and can also be started manually from the Actions tab ("Run workflow"). It installs dependencies, runs the unit tests, builds the static export, and publishes `./out` with `actions/deploy-pages`.

One-time setup:
1. Push this project to `https://github.com/zibafar/getdomain` on the `main` branch.
2. In the repo, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Open **Actions → Deploy to GitHub Pages** and wait for the green check, or click **Run workflow**.
4. Open https://zibafar.github.io/getdomain/.

## Project layout

```
src/lib/availability.ts   RDAP + DNS-over-HTTPS providers, cache, throttle, rules
src/lib/ai.ts             WebLLM engine, prompt/JSON schema, parser, no-GPU fallback
src/lib/llm.worker.ts     WebLLM worker
src/lib/domains.ts        types, TLDs, IRNIC naming rules
src/components/domain-finder.tsx   the UI
tests/                    unit + live tests
```
