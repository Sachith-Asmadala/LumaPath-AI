# Competition MVP v1.0 — presenter guide

## A. Two-minute prototype route

| Time | Exact click path | Explain |
| --- | --- | --- |
| 0:00–0:20 | Overview → **Why this?** → close | Academic urgency, dependency impact, career relevance and capacity explain the next action. |
| 0:20–0:40 | **Move assignment deadline: Oct 7 → Oct 5** | **PLAN ADAPTED**: assignment Oct 7 → Oct 5; Docker Oct 5 → Oct 7. Actual blocks and clear reasons, with the quiz preserved. |
| 0:40–1:00 | Banner → **Opportunity** | Junior DevOps Internship: Git **MET** with project evidence, Docker **UNMET**, AWS **UNKNOWN**. |
| 1:00–1:30 | **Build preparation plan** → edit a title → review checkbox → **Approve selected tasks** → **View approved tasks in Planner** | Generation does not create tasks. Explicit approval adds selected work. Schedule/duration remain editable before approval. |
| 1:30–2:00 | Banner → **Career Compare** → **Compare careers** | DevOps versus Cloud: shared, transferable and unique skills, effort/duration ranges, free/low-cost/certification routes. |

## B. Demo reset

Open **http://localhost:3000/competition-demo** and click **Start Competition Demo**. Wait for Overview. Before repeating, click **Reset demo** in the synthetic-data banner. It restores four tasks, four study blocks and three imported calendar events, clears prior preparation/comparisons/usage and preserves other students. It also restores the [sample portfolio, analyzed CVs, certificate photos and learning documents](demo-content.md).

The reset repairs missing seeded records and replaces stale localStorage. If it reports a failure, verify the API is running and retry; do not present a failed reset as success. Backend-only seeding uses:

```sh
LUMAPATH_ENV=demo .venv/bin/python scripts/seed-data/seed-competition-demo.py
```

The CLI and API must use the same database. CLI seeding alone does not reset browser state. These controls and seed actions are unavailable in production.

## C. Local startup on macOS

Prerequisites: Node.js 20+, npm, Python 3.11–3.13.

```sh
cd /path/to/LumaPath-AI
./setup.sh
LUMAPATH_ENV=demo ./run.sh
```

Setup installs locked frontend dependencies and the Python test/runtime extras. It preserves an existing `.env`. Web uses port 3000; FastAPI uses 8000; Ctrl+C stops the launcher services. Health: `http://127.0.0.1:8000/health` and `http://localhost:3000/api/health`.

Use the development launcher for the competition. `npm run build` / `npm run start` validates the production frontend, where demo switching and resets are intentionally unavailable. Do not expose the development identity API publicly.

## D. Expected demo data

- Synthetic student **Sachith**, Luma University, goal **DevOps Engineer**, backend **Pro** plan.
- Fixed scenario date **October 5, 2026**; **90 minutes** available today.
- Git/Linux strong verified evidence; Docker partial, CI/CD weak, Cloud partial.
- Software Engineering assignment, Statistics quiz, Computer Graphics lab, Docker practice.
- Assignment briefs include module names, submission requirements, realistic remaining work and assessment weighting.
- Six practical learning articles on containers, Compose networking, CI, IAM, Linux troubleshooting and Git reviews; four notification records with read/unread states.
- Synthetic Northstar Labs **Junior DevOps Internship**, with MET/UNMET/UNKNOWN requirements.
- Sample internship details include a 12-week hybrid placement in Colombo, a Nov 2 start after the Oct 14 application deadline, and a three-step preparation checklist.
- DevOps Engineer and Cloud Engineer preselected for DOC-F33 comparison.
- Governed synthetic market/intelligence fixtures under `example.org`; not live labour-market research.

The shared manifest is `src/data/demo/competition-scenario.json`. Backend services freeze the clock only for this dedicated synthetic student; ordinary users keep normal service clocks.

The regular browser demo uses `src/data/demo/seed.ts`: 15 tasks, 20 calendar blocks, four completed sessions (240 minutes), three sample opportunities, and six notifications. Its fixed scenario week remains Sep 28–Oct 4. Reset the demo to load fresh fixtures; previously saved student work is preserved until reset. Competition resets keep their four-task/four-block walkthrough and do not inherit the regular demo's completion history.

## E. Backup if internet fails

Install dependencies beforehand and keep the repository, `.venv`, `node_modules` and private local demo database on the presentation laptop. Local fonts and deterministic providers support the main story without internet. Warm Overview, Opportunity and Career Compare once, then reset again before presenting.

Keep a local screen recording or PDF/screenshots as a separate presenter backup. External learning/source links need internet; demonstrate the locally seeded metadata and approval workflow instead. If the API is down, restart `./run.sh` and check health. Error states remain honest and do not invent successful API results.

## F. Known limitations

Planner/capacity/onboarding and some learning state remain browser-local; there is no cross-device planner sync. Production student/admin/curator authentication is not integrated, and development identity headers are rejected in production. SQLite and local workers need operational hardening before public multi-instance deployment.

Pro billing is an **MVP/demo entitlement flow**, with no real payment provider. The university LMS UI uses controlled samples; the institutional/API connector is future/partial, while manual iCalendar/CSV import works. External AI, push/email delivery, source-control OAuth and credential verification must not be implied to be live integrations. Market demo data may be synthetic.

To demonstrate a Pro upgrade, open Pricing, select Free in **Competition Demo Plan** if Pro is already active, then click **Upgrade to Pro**. The standalone `/checkout` page offers monthly ($4.99) and annual ($47.90) demo totals, billing details, card validation, processing states, and a downloadable demo PDF receipt. Click **Use demo card**, then **Activate Pro**. The PDF receipt downloads automatically after activation. **Download PDF receipt** on the confirmation screen saves another copy. The PDF includes customer details, the date, transaction reference, itemized totals, and the $0.00 actual charge. It is generated locally with bundled fonts and branding. The existing subscription API activates the student's demo Pro entitlement; only `{ "plan": "pro" }` is sent. Card fields never leave the page. No charge, recurring billing, payment-provider connection, tax invoice or email receipt is created. Annual billing is illustrative and does not create a billing schedule.

## G. What not to claim to judges

Do not claim completed payment checkout, live institutional/LMS connectivity, live job/market research, verified production authentication, fully server-persisted planning, accredited learning certificates or guaranteed credential authenticity.

Do not claim guaranteed employment, admission or eligibility predictions. Readiness states describe available evidence; unknown evidence is not proof that a student lacks the skill. Cost and duration values are planning estimates, with unknown prices kept unknown.

**Rules decide. Optimisation schedules. AI explains.** In this competition build the explanation provider is deterministic; no external-model performance claim is made. This is the frozen competition release candidate.

## H. Free and Pro visual demo

Open Pricing and use **Competition Demo Plan** to switch the verified backend plan, then open Overview. Free shows light appearance, three concise sample updates, and locked previews of advanced tools. Pro (and Institution) unlocks dark/system appearance, eight expandable career updates, three example career scenarios with calculation history, three synthetic regional views, a four-step internship preparation checklist, and an adaptive planning preview. The additional examples are presentation fixtures, not saved scenarios, live market research, or applied planner changes. Student tasks and saved work are preserved across plan changes.

Settings marks dark and system appearance as Pro features. Free stays light even when a browser has a stored dark preference or the operating system uses dark mode. Pro can choose any appearance; switching back to Free immediately returns to light. The stored Pro preference is retained for a later upgrade. Pricing includes a side-by-side comparison of themes, actual plan limits, and demo examples.
