# Competition monetisation MVP

The existing student journey and visual system are preserved. No billing SDK,
checkout or payment gateway is installed. Visit `/pricing`, `/plans` or
`/settings/subscription` after entering the workspace.

## Plan rules

| Capability | Free | Pro | Institution |
| --- | --- | --- | --- |
| Active roadmap | 1 | 1 | 1 |
| Saved comparison scenarios | No saved history | 3 | 3 |
| Career comparisons per UTC month | 2 | 30 | 30 |
| Roles per comparison | 2 | 4 | 4 |
| Assistant requests per UTC day | 15 | 100 | 100 |
| Intelligence items per UTC day | 3 distinct items | Full available feed | Full available feed |
| CV analyses per UTC month | 2 | 15 | 15 |
| Document analyses per UTC month | 3 | 25 | 25 |
| Preparation proposals per UTC month | 3 | 30 | 30 |
| Adaptive automatic replanning | No | Yes | Yes |
| International market profile | Yes | Yes | Yes |
| Regional market comparison | No | Yes | Yes |
| Advanced opportunity preparation approval | No | Yes | Yes |
| Institutional analytics, taxonomy governance, mentor tools | No | No | Yes, with existing role/consent checks |

Profile, assessment, career path, skill gap, learning, basic planner, capacity,
basic Next Best Action, Evidence Passport and opportunity browsing stay available
on Free. Explicit capacity/recovery choices and basic plan generation stay free.
Automatic weekly rescheduling, automatic deadline rescheduling and the automatic
recovery action request Pro authorisation before running.

The existing roadmap architecture maintains **one active roadmap**. Pro supports
three saved simulation scenarios alongside it; it does not introduce concurrent
active roadmaps. Saved history reuses the current scenario/result architecture;
it lists saved scenarios and exposes their existing immutable calculation results
through a Pro-only result-history API and view.
International is the default market profile so Free users can enter the page.

## Backend and enforcement

`apps/api/app/modules/subscriptions/` contains the central entitlement service,
plan definitions, repository, API and staff/mentor dependencies. SQLite stores
`plans`, `subscriptions`, `plan_entitlements`, `usage_counters`,
`subscription_events`, and idempotent `subscription_resources` grants. Existing
saved simulations are imported when the repository initializes.

- Missing/inactive subscriptions use Free. There is no client plan claim.
- Metered requests reserve quota atomically using `BEGIN IMMEDIATE`. Failed
  synchronous domain operations refund their reservation. Accepted document
  uploads count once; retries of those jobs do not consume additional quota.
- Daily/monthly counters use UTC and carry across plan switches. Deleting content
  does not reset analysis counts. No background reset job is needed.
- Saved slots are idempotent, released on unsave, and limited before domain work.
- Intelligence grants persist distinct article IDs for the UTC day. Refreshing,
  dismissing content or calling save/add-to-plan directly does not reveal more
  than the daily Free allocation. Pro remains subject to the existing feed
  freshness, diversity and configured ranking limits (default eight available items).
- Existing ownership, rate limits, staff institution/region scopes, mentor token
  expiry and consent controls remain enforced. Institution never replaces those
  controls. Student Pro cannot access staff APIs.

Protected API entry points: scenario create/recompute, saved-history/save and result history; assistant
respond; CV analysis; document upload/analysis admission; opportunity preparation
preview/approval; intelligence feed/save/planner handoff; regional profile
comparison; institutional analytics; taxonomy staff routes; mentor relationship
creation, invitation acceptance, guidance creation, mentor access and evidence
mentor responses. Basic read/consent/revocation endpoints remain available.

The existing planner is browser-local. `/v1/subscriptions/automation/authorize`
enforces its advanced action entitlement on the server and records an event;
the browser then runs the existing optimizer. This does not turn local demo state
into server-owned planner data. A future server planner must enforce the same
entitlement on its actual mutation endpoint.

Plan errors return 403 for unavailable capabilities or 429 for exhausted quotas:

```json
{
  "code": "PLAN_LIMIT_REACHED",
  "feature": "career_comparisons",
  "plan": "free",
  "limit": 2,
  "used": 2,
  "upgrade_required": true,
  "required_plan": "pro"
}
```

The shared frontend error decoder handles this payload and the conventional
FastAPI `detail` envelope. It preserves each module's typed API error and opens a
plan-specific upgrade dialog with a link to pricing. Usage cards show reset dates.

## Demo and production

Run `./run.sh` with the API environment `LUMAPATH_ENV=development` (default),
`demo` or `test`. The Competition Demo Plan selector calls
`POST /v1/subscriptions/demo-plan` through Next.js and changes the current
prototype student's persisted subscription. Refreshing preserves that plan.
`GET /v1/subscriptions/me` returns current allowances and counters;
`GET /v1/subscriptions/plans` returns the public entitlement catalogue.

Set **`LUMAPATH_ENV=production`** on deployed APIs. All other environment values
fail closed for plan switching. Production returns 404 for the demo endpoint and
reports `demo_switch_enabled=false`. Next production builds independently disable
the selector and reject the proxy endpoint, even when pointing at a demo API.
Do not expose a development API as a production service.

Production work remains: replace the repository's existing trusted student/staff
headers with verified session/JWT claims, provision institution memberships and
licences from those verified claims, implement approved commercial pricing and
billing checkout/webhooks/cancellation/renewal handling with idempotent subscription
events, and migrate/deploy/back up the subscription tables appropriately. No
production purchase or authentication flow is implemented by this MVP.

## Focused checks

```bash
.venv/bin/python -m pytest apps/api/tests/test_subscriptions.py -q
npm run typecheck
npm run build
# Start a development frontend and API; the pricing test exercises the real demo API.
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/subscriptions.spec.ts --workers=1
```

The tests cover atomic quotas/refunds/reset windows, real comparison API access,
saved slots, stable daily feed grants, actual institution API plan/role checks,
demo production lockout, automation authorisation, pricing/usage rendering,
backend plan persistence, mobile layout and upgrade messaging.

For the competition release, this quota is consumed when generating a preparation proposal, not by browsing opportunities or reading requirement states. Development student/admin/curator identity headers are rejected in production until verified authentication is integrated. See `docs/competition-demo.md`.
