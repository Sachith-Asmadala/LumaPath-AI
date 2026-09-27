# LumaPath AI

LumaPath helps students connect academic deadlines, an adaptive day plan, and career readiness. The current app uses a deterministic local student scenario; changes made in the UI reset when the page is reloaded.

## Run locally

Use Node.js 20.20.2 or newer and npm. This repository has a `package-lock.json` and uses npm as its package manager.

```bash
npm ci
npm run dev
```

Open the URL printed by Next.js. It is usually <http://localhost:3000>; if that port is busy, Next.js prints another port such as 3001.

The `pnpm` command installed on some Macs may require a newer Node.js version. With Node 20 and Homebrew pnpm 11, `node:sqlite` fails before the app starts. Use `npm run dev` for this repository. If you choose to use pnpm in another project, install a pnpm version compatible with your Node.js version.

The app is on Next.js 15. Its development output goes to `.next-dev`, while production builds go to `.next`, so `npm run build` can run without deleting files used by a live development server. If a server started before this change still reports a missing `_buildManifest.js.tmp` file, stop that server and start `npm run dev` again. Run only one development server for this checkout at a time.

The PostCSS override in `package.json` patches the version nested under Next.js 15; `npm audit` now reports zero vulnerabilities without a major Next.js upgrade.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The browser tests require a one-time `npx playwright install chromium`. See [the dashboard review notes](docs/dashboard-review.md) for the connected Overview flow and its demo limitations.
