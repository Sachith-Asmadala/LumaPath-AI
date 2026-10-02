# LumaPath AI

**Adaptive Student Success & Career Intelligence Platform**
**Competition MVP v1.0 · `1.0.0-competition` · frozen release candidate**

**Rules decide. Optimisation schedules. AI explains.**

LumaPath connects academic deadlines, available capacity, career pathways and evidence so students can decide what to do next. The competition release demonstrates a complete basic journey plus Free, Pro and Institution entitlements. It is a working MVP with explicit synthetic demonstration data and production limitations.

## Start locally on macOS

Requires Node.js 20+ with npm and Python **3.11–3.13**. The supported setup creates a project `.venv`; it does not install Python dependencies into the system interpreter.

```sh
cd /path/to/LumaPath-AI
./setup.sh
LUMAPATH_ENV=demo ./run.sh
```

`setup.sh` uses `npm ci` with the committed lockfile and installs API/test dependencies. It creates `.env` from `.env.example` only when `.env` is absent. Existing private environment files are preserved. `run.sh` starts Next.js, FastAPI and the notification worker; Ctrl+C stops all three. Ports 3000 and 8000 must be free.

- Web: **http://localhost:3000**
- Competition entry: **http://localhost:3000/competition-demo**
- API docs: **http://127.0.0.1:8000/docs**
- API release health: **http://127.0.0.1:8000/health**
- Web/API integration health: **http://localhost:3000/api/health**

No external AI, payment or university account is required for the seeded presentation. Prepare dependencies and warm the demo routes before travelling to the venue.

## Current architecture

```text
Next.js UI
  → Next.js server API proxies
  → FastAPI routers and permission/entitlement checks
  → domain services
  → repositories
  → SQLite database + private document/CV storage
  → background processing / notification worker
```

The repository uses Next.js 15, React 19 and TypeScript for the existing responsive UI, and FastAPI/Pydantic with Python for domain APIs. Services own domain rules; repositories own durable SQLite records. Next.js proxies keep the backend URL and server-only configuration out of the browser.

**Persistence is mixed by design:** assessments, approved backend pathways, simulations, evidence, uploads, applications, notifications, institutional analytics and subscriptions have backend persistence. The current student workspace's onboarding, tasks, Planner blocks, capacity and portions of learning/focus state still use browser localStorage. Approved API preparation suggestions are explicitly handed into that existing Planner. This release does not claim a fully server-persisted or multi-device planner.

The notification worker runs independently. Document processing and analytics aggregation use the existing backend background executors. Other worker directories contain integration/job contracts and are not proof that every external provider is connected.

## Working MVP modules

| Area | Current behaviour |
| --- | --- |
| Overview / Next Best Action | Academic urgency, career relevance, dependencies and capacity explain recommended work. |
| Tasks / Planner / Capacity / Focus | Task management, calendar/agenda views, capacity check-in, adaptive demo changes and focus sessions. Some state remains browser-local. |
| Career assessment / pathways / skills / learning | Structured assessments, prerequisite-aware pathways, skill gaps, curated learning routes and explicit approval of backend pathway actions. |
| Career Compare (DOC-F33) | Shared, transferable and unique skills; remaining effort and duration ranges; free, low-cost and certification routes; saved scenario history according to plan. |
| Study Assistant | Context-scoped structured guidance, reviewable actions and safe output validation. The competition provider is deterministic; a live external model is not required or claimed. |
| Document / CV / Portfolio intelligence | Private document parsing, source-grounded study outputs, factual CV review and portfolio evidence. Suggestions need explicit review; no invented achievements. |
| Evidence Passport | Evidence provenance, verification meaning, controlled sharing and mentor validation. Self-reported evidence is distinguished from verified/observed evidence. |
| Opportunities / applications / interviews | Structured opportunity requirements, MET/UNMET/UNKNOWN readiness, editable preparation proposals, explicit Planner approval, application tracking and practice feedback. |
| Career Intelligence / market taxonomy | Governed ingestion/ranking and reviewed market/taxonomy contracts. Seeded market observations and intelligence items can be synthetic. |
| Notifications / calendar imports | Owner-scoped notification policy, quiet hours, deduplication and retries; manual iCalendar/CSV preview and confirmation. |
| Mentors / teams / achievements / analytics | Existing relationship/consent boundaries, collaboration, milestone tracking and private analytics. |
| Institution | Staff/role-scoped aggregate analytics, mentoring and taxonomy governance; student Pro does not grant staff access. |
| Subscriptions | Central server-side Free/Pro/Institution entitlements, usage counters and helpful upgrade states. No real billing. |

See the existing module guides under [`docs/`](docs/), especially [monetisation](docs/monetisation.md), [Study Assistant](docs/study-assistant.md), [notifications](docs/notifications.md) and [the competition presentation](docs/competition-demo.md).

## Plans and the business model

Free preserves the full basic journey: **Profile → Assessment → Career Path → Skill Gap → Learning → Planner → Capacity → Basic Next Best Action**. Opportunity browsing, Evidence Passport and the international profile remain part of that journey.

| Allowance / capability | Free | Pro |
| --- | --- | --- |
| Active pathway / saved scenarios | 1 active pathway | 1 active pathway + up to 3 saved comparison scenarios |
| Career comparisons | 2/month, maximum 2 roles | 30/month, maximum 4 roles |
| Assistant requests | 15/day | 100/day |
| Career Intelligence | 3 items/day | Full available governed feed |
| CV / document analyses | 2 / 3 per month | 15 / 25 per month |
| Preparation proposals | 3/month | 30/month |
| Planning | Basic planner and NBA | Advanced adaptive planning |
| Market profiles | International | Regional + international comparison |
| History / preparation | Basic journey | Scenario history and advanced opportunity preparation |

Institution includes Pro capabilities plus institution analytics, governance and mentoring/admin capabilities, **with the existing role and consent checks**. There is one active roadmap in the current architecture, not three simultaneously active roadmaps.

Limits are enforced by the central backend entitlement service, not just hidden buttons. Daily/monthly counters renew at UTC boundaries. `/pricing`, `/plans` and `/settings/subscription` show plans and usage. The **Competition Demo Plan** selector updates the actual backend plan only in development/demo/test mode. Billing, checkout and paid subscription reconciliation are future work.

## Deterministic competition demo

Open `/competition-demo` and click **Start Competition Demo**. It restores a dedicated synthetic Pro student, fixed October 5, 2026 dates, four tasks, four planned blocks and predictable evidence/readiness. The discreet banner identifies synthetic data and supplies the short navigation path.

**Overview → Why this? → Move assignment deadline → PLAN ADAPTED → Opportunity → Build preparation plan → edit → explicitly approve → Planner → Career Compare.**

Reset before every presentation. The reset clears the dedicated student's previous preparation, comparisons and usage; other students are preserved. Backend-only seeding is also available:

```sh
LUMAPATH_ENV=demo .venv/bin/python scripts/seed-data/seed-competition-demo.py
```

Use the same database as the running API. CLI seeding alone does not reset browser localStorage. The clock is frozen only for the dedicated synthetic student. See [the short presenter guide](docs/competition-demo.md) for timing, offline backup steps and what not to claim.

## Environment and deployment boundaries

`.env.example` documents local defaults and server-only controls. Never commit `.env`, private upload files, SQLite data or real credentials. Production HMAC pseudonymisation and future connector credentials must be supplied through deployment secrets; example placeholders are not production secrets.

**This release is not ready for a public production student deployment.** Student/admin/curator identity headers are trusted only in development/demo/test. With `LUMAPATH_ENV=production`, those identity dependencies fail closed until verified authentication is implemented. Existing ownership, consent, staff roles and entitlements still apply in demo mode. Mentor/share token flows retain their existing expiry and consent checks.

Demo plan switching, competition reset and synthetic seeding are disabled outside development/demo/test. Next.js production builds also disable demo controls. Keep development APIs on localhost or a private presentation network. `docker-compose.yml` contains local development defaults; it is not a hardened public deployment configuration. API documentation/health endpoints are not student authentication.

For production frontend validation:

```sh
npm run build
npm run start
```

The build does not enable billing, verified sessions, cloud backups, malware scanning or third-party providers. The API image packages its fixture and seed helpers; upload directories and SQLite require persistent private storage and backup policy. No container deployment has been claimed merely because Dockerfiles exist.

Health endpoints disclose only release/service status. FastAPI returns `status: healthy` and `version: 1.0.0-competition`. The web health proxy returns **503/degraded** if the backend cannot be verified; it never claims a healthy backend while offline.

## Release checks

The available project checks are:

```sh
npm ci
npm run check:imports
npm run check:i18n
npm run check:pseudo
npm run lint
npm run typecheck
npm test
npm run build
.venv/bin/python -m pytest apps/api/tests -q
.venv/bin/python -m compileall -q apps/api/app apps/worker scripts/seed-data
```

There is no generic `npm run check` script. `npm run verify` runs the frontend checks in order. Existing Playwright infrastructure can verify the short demo against running services:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/competition-demo.spec.ts tests/e2e/subscriptions.spec.ts --workers=1
```

## Synthetic data, future integrations and limitations

- The competition student, opportunity, market observations and intelligence fixtures are synthetic. They are not live vacancies or live market research.
- Learning links may point to external resources; metadata and estimates are not a guarantee of current prices, accreditation or availability.
- Payment provider, billing lifecycle and invoices are not implemented. Pro is an entitlement/demo demonstration.
- The university LMS page uses controlled sample assignments. Manual calendar import works; a live institutional/LMS API connector is future/partial work.
- Live AI providers, source-control OAuth, email/push delivery and external credential verification are future integrations unless explicitly configured and validated.
- Readiness is evidence-based planning support. Missing evidence stays unknown; there are no guaranteed eligibility, admission or employment predictions.
- Browser-local planning state does not synchronise between devices. SQLite/process-local workers require further operational hardening for multi-instance production.

The competition release candidate is frozen after this pass. Further changes should address verified release defects rather than add product features.

See the [final release verification record and file inventory](docs/competition-release.md).
