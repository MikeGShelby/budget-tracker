# Ledger — Calendar Budget

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A budget tracker built as a month calendar. Every day that money moves shows the
balance you'll actually have that day, so you can see an upcoming shortfall
weeks before it happens instead of reconstructing it from a list of
transactions.

Add $2,000 of pay on the 1st and the 1st reads **$2,000**. Add a $500 bill on
the 10th and the 10th reads **$1,500**.

## Contents

- [What it does](#what-it-does)
- [Running it locally](#running-it-locally)
- [Deploying](#deploying)
- [Shipping it as an iPhone app](#shipping-it-as-an-iphone-app)
- [How it's built](#how-its-built)
- [License](#license)

## What it does

- **Month calendar** — a running balance on every day a change occurs, and
  nothing on the days in between, so the days that matter stand out.
- **Overdraft warnings** — any day projected to go negative is tinted and
  flagged.
- **Repeating events** — weekly, every two weeks, twice a month, monthly and
  yearly, with an optional end date. A rule anchored on the 31st fires on
  Feb 28 and then returns to the 31st in March rather than drifting.
- **Categories** — mortgage, rent, credit card, utilities, groceries, paycheck
  and more, each with its own icon and colour.
- **Local-first** — everything is stored on your device with IndexedDB. There is
  no account, no server, and nothing leaves the browser.

## Running it locally

```bash
npm install
npm run dev
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the projection-engine test suite |
| `npm run typecheck` | Type-check without emitting |

## Deploying

The build is a static bundle, so any static host works. The only host-specific
setting is the base path, read from `VITE_BASE_PATH` at build time.

**GitHub Pages** (current) — `.github/workflows/deploy.yml` runs the tests,
builds with `VITE_BASE_PATH=/budget-tracker/`, and publishes. It needs Pages set
to **Settings → Pages → Source: GitHub Actions** once.

**A root domain** (Cloudflare Pages, Netlify, Vercel, a custom domain) — leave
`VITE_BASE_PATH` unset; it defaults to `/`. For Cloudflare Pages, point it at
this repo with build command `npm run build` and output directory `dist`.

The web app manifest uses relative icon and `start_url` paths so installing to a
home screen works from either a subpath or a root domain.

## Shipping it as an iPhone app

`capacitor.config.ts` is set up to wrap the same build as a native iOS app —
no rewrite, no second codebase.

```bash
npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/ios
npx cap add ios
npm run ios:sync
npm run ios:open
```

This needs macOS and Xcode. The UI is already built for it: safe-area insets are
respected, tap targets meet the 44pt minimum, inputs use a 17px font so iOS
doesn't zoom on focus, sheets are drag-to-dismiss, and `prefers-reduced-motion`
collapses every animation.

## How it's built

- **React 19 + TypeScript + Vite**
- **Zustand** for state, **IndexedDB** (via `idb`) for storage behind a
  repository interface, so adding sync later is an adapter rather than a rewrite
- **Motion** for the sheet and calendar transitions
- Plain CSS with design tokens — no CSS framework

Two rules hold throughout:

1. **Money is an integer count of cents.** Never a float, so a projection over
   hundreds of events can't drift.
2. **Dates are local civil `yyyy-MM-dd` strings.** Parsing those with `new Date()`
   yields UTC midnight, which lands on the previous day for anyone west of
   Greenwich — that would move a paycheck to the wrong date, so every conversion
   goes through `src/domain/dates.ts`.

The projection engine is covered by 99 tests, verified across seven timezones.

## License

MIT

## Author

Mike Shelby — [github.com/mikegshelby](https://github.com/mikegshelby)
