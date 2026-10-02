<div align="center">

# 🌌 LumaPath AI

### Know what to do next. Stay on track. Build your future.

**Adaptive Student Success & Career Readiness Platform**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/IT24103430/LumaPath-AI)

**hackX 11.0 — ideaX Semi-Final Project**

</div>

---

## 🚀 Overview

**LumaPath AI** is an adaptive student success and career-readiness platform designed to help university students answer one important question:

> **What should I do next?**

Students often need to manage academic deadlines, available study time, career preparation, skill development, learning resources, projects, and personal capacity across multiple disconnected systems.

LumaPath brings these signals together and uses structured decision logic to generate realistic priorities, adaptive schedules, career learning paths, and explainable recommendations.

The system focuses on connecting:

```text
Academic Work
      +
Deadlines
      +
Available Capacity
      +
Skills
      +
Career Goals
      ↓
Risk & Priority Analysis
      ↓
Adaptive Planning
      ↓
Next Best Action
      ↓
Explainable Recommendations
      ↓
Progress Tracking & Replanning
```

---

## 🎯 Core Product Principle

LumaPath follows a simple architecture philosophy:

> **Rules decide. Optimisation schedules. AI explains.**

- Structured logic determines priorities and deadline risks.
- Scheduling logic generates realistic student plans.
- Career logic identifies skill gaps and learning priorities.
- The user can understand why recommendations were made.
- Important planning decisions remain traceable.

---

## ✨ Current Prototype Features

### 📊 Student Dashboard

The dashboard provides a central view of the student's current situation, including:

- academic workload
- upcoming deadlines
- career readiness
- daily priorities
- capacity
- deadline risk
- Next Best Action
- learning progress
- weekly progress

### 🎯 Career Goal & Skill Roadmap

The current prototype focuses on a **DevOps Engineer** career pathway.

It includes:

- personalized DevOps roadmap
- prerequisite-aware skill progression
- skill-gap identification
- career readiness tracking
- learning stages
- learning resources
- project-based evidence
- skill verification

### 🧠 Baseline Assessment

Students can complete a technical knowledge assessment that helps LumaPath identify their current skill level.

The prototype supports:

- weighted assessment questions
- category-based scores
- assessment history
- reassessment
- preserved progress after retakes
- skill-gap calculation

### 📚 Learning Workspace

The Learning workspace connects career learning with the rest of the student planning system.

Students can:

- access recommended learning resources
- follow free learning paths
- bookmark learning resources
- complete learning stages
- connect learning tasks to the planner
- submit project evidence
- complete knowledge checks
- view completed learning

### 🗓️ Adaptive Planner

The planner combines academic work and career development.

Features include:

- task scheduling
- academic deadlines
- career-learning tasks
- weekly planning
- agenda view
- capacity-aware planning
- automatic schedule adjustment
- flexible task movement
- deadline protection

### ⚡ Next Best Action

LumaPath analyzes student context and recommends the most useful next action.

The recommendation can consider:

- deadline urgency
- available capacity
- academic importance
- task flexibility
- career progress
- learning continuity
- skill gaps

### ⚠️ Deadline Risk Detection

LumaPath evaluates academic tasks to identify situations where the current schedule may put a deadline at risk.

The system can use that information to:

- prioritize urgent academic work
- protect important deadlines
- move flexible work
- generate explanations
- trigger automatic replanning

### 🔄 Automatic Replanning

Plans can adapt when the student's situation changes.

Example triggers include:

- deadline changes
- new assignments
- missed tasks
- reduced available capacity
- urgent academic work

The goal is not simply to move tasks, but to preserve realistic progress while protecting important deadlines.

### 🔋 Capacity Check-In

Students can provide information about their current available capacity.

This helps LumaPath generate more realistic plans instead of assuming every day has the same available time and energy.

### 🛟 Recovery Mode

Recovery Mode helps adjust the workload when the student's available capacity decreases.

It prioritizes important work while allowing flexible tasks to move to safer times.

### 🧭 Career Readiness

The platform tracks career progress using observable learning and evidence signals.

Career readiness can reflect:

- assessed knowledge
- verified skills
- learning completion
- submitted project evidence
- roadmap progress

### 🏆 Evidence Passport

The Evidence Passport allows students to keep track of evidence connected to their career development.

Examples include:

- projects
- completed learning
- verified skills
- external certificates
- local learning records

External credentials are treated as **self-reported information** in the current prototype.

### 🎓 Skill Verification

Learning progress can include:

```text
Learning
   ↓
Practice
   ↓
Project
   ↓
Assessment
   ↓
Verification
```

Local completion records require the appropriate learning and assessment requirements to be completed.

### 🧘 Student Capacity & Life Load

The prototype includes optional capacity and Life Load information.

This information remains within the browser-based prototype state.

LumaPath is **not a medical system** and does not provide medical diagnosis.


### 🤝 Consent-Controlled Mentor Support (DOC-F24)

Students can issue a purpose-limited, expiring mentor relationship and choose exactly which summaries are shared. Mentor access uses a one-time invitation plus a separate revocable relationship token; every read is checked server-side and recorded in student-visible access history.

The implemented mentor view can expose only explicitly consented:

- academic summary
- career goal
- career-readiness summary
- active roadmap milestones
- student-authored guidance requests

Private capacity/check-in notes, raw CV source documents, interview recordings/answers, private task descriptions and uploaded document contents are not part of the mentor-share schema. Mentor comments/recommendations remain separate records and cannot alter Planner until the student accepts the recommendation and separately confirms a schedule.

### 🔔 Notification Policy & Inbox (DOC-F20)

LumaPath now has a server-owned notification policy and in-app inbox for:

- deadline and risk alerts
- Next Best Action priority signals
- missed work
- upcoming study/focus blocks
- internship/application reminders
- roadmap milestones
- future confirmed calendar events through the DOC-F23 contract

The policy applies owner scope, IANA timezone-aware quiet hours, category preferences, a one-control non-critical mute, frequency caps, deduplication, expiry/resolution checks and idempotent delivery records before an alert can appear. Push/email are adapter contracts only in this prototype and remain disabled until a provider plus explicit user permission/consent is configured. External previews are generic by default so lock screens do not expose task, CV, mentor or application details. See `docs/notifications.md`.

### 🧭 Intelligence

The workspace also contains contextual intelligence related to learning, career progress and changing priorities.

### 🤖 Context-Aware Assistant

The prototype includes contextual guidance based on structured student state.

The assistant can provide explanations related to:

- planning
- priorities
- career development
- learning
- capacity

The current prototype does not require an external AI API.

---

## 🎬 Competition Demo Flow

A typical competition demo can follow this journey:

```text
Student Profile
      ↓
Career Goal
      ↓
Baseline Assessment
      ↓
Skill Gap Analysis
      ↓
Career Roadmap
      ↓
Academic Tasks
      ↓
Capacity Check-In
      ↓
Deadline Risk
      ↓
Next Best Action
      ↓
Adaptive Weekly Plan
      ↓
Situation Changes
      ↓
Automatic Replanning
      ↓
Explanation of Changes
      ↓
Career Learning Progress
```

This demonstrates the main value of LumaPath:

> **Academic survival and career development should not compete with each other — they should be planned together.**

---

## 🧱 Technology Stack

### Frontend

- **Next.js 15**
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **shadcn/ui**
- **Radix UI**
- **Lucide React**

### UI & Interaction

- **Motion**
- **Sonner**
- **cmdk**
- **next-themes**

### Visualization

- **Recharts**
- **React Flow / XYFlow**
- **FullCalendar**

### Testing

- **Vitest**
- **Playwright**
- **ESLint**
- **TypeScript type checking**

### Deployment

- **GitHub**
- **Vercel**

---

## 🏗️ Current Architecture

The competition prototype intentionally uses a lightweight browser-local architecture.

```text
┌───────────────────────────────┐
│          Next.js App          │
│                               │
│  Dashboard                    │
│  Planner                      │
│  Tasks                        │
│  Learning                     │
│  Career Roadmap               │
│  Evidence                     │
│  Analytics                    │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│   Shared Application State    │
│   React Context + Reducer     │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│        Browser Storage        │
│         localStorage          │
└───────────────────────────────┘
```

### Current Prototype Limitations

The current competition prototype:

- is browser-local
- is designed primarily for a single student
- currently focuses on the DevOps career pathway
- does not have a production backend
- does not have user account authentication
- does not have a production database
- does not process payments
- does not provide real premium subscriptions
- does not provide publicly verifiable certificates
- does not depend on an external AI API

These are deliberate prototype boundaries rather than production security claims.

---

## 📁 Project Structure

The source tree is organized by ownership: Next.js routing stays in `src/app`, reusable UI stays in `src/components`, and product-specific UI + deterministic business logic live together under `src/features`.

```text
LumaPath-AI/
├── public/
│   └── brand/
├── src/
│   ├── app/                         # Next.js routes
│   ├── components/                  # Shared UI/layout/brand/motion
│   ├── config/                      # Stable application configuration
│   ├── data/
│   │   └── demo/                    # Browser-local prototype data + seed
│   ├── features/
│   │   ├── assessment/
│   │   ├── assistant/
│   │   ├── capacity/
│   │   ├── career/
│   │   ├── dashboard/
│   │   ├── evidence/
│   │   ├── focus/
│   │   ├── intelligence/
│   │   ├── learning/
│   │   ├── onboarding/
│   │   ├── planner/
│   │   ├── skills/
│   │   ├── tasks/
│   │   └── workspace/
│   ├── hooks/
│   ├── integrations/                # LMS/provider adapters
│   ├── lib/                         # Generic utilities only
│   ├── state/                       # Shared prototype state
│   └── tests/
│       └── unit/
├── tests/
│   └── e2e/
├── scripts/
├── docs/
└── .github/workflows/
```

See [`docs/project-structure.md`](docs/project-structure.md) for folder ownership rules, the safe-reorganization guarantees, and the recommended future backend layout.

---

## 💻 Run Locally

### Requirements

Make sure you have:

- Node.js 20+
- npm
- Git

Check:

```bash
node --version
npm --version
git --version
```

### Clone the Repository

```bash
git clone https://github.com/IT24103430/LumaPath-AI.git
cd LumaPath-AI
```

### Quick Start on macOS

Install Node.js 20+ with npm and Python 3.11–3.13, then run from the project folder:

```bash
./run.sh
```

On the first run, the launcher installs dependencies in `node_modules` and a local
`.venv`, and creates `.env` from `.env.example` if needed. It preserves an existing
`.env`. It starts the Next.js frontend at http://localhost:3000, the FastAPI backend
at http://127.0.0.1:8000 (API docs at `/docs`), and the notification worker.
Press **Ctrl+C** to stop all three. Ports 3000 and 8000 must be available.

To install or refresh dependencies separately, run `./setup.sh`. Both scripts work
when launched from another directory, including project paths containing spaces.
If execute permissions were lost when downloading, run `chmod +x setup.sh run.sh`
or use `bash run.sh`.

### Manual Frontend Setup

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## 🧪 Project Checks

### Structural Import Check

```bash
npm run check:imports
```

### Production Build

```bash
npm run build
```

### TypeScript Check

```bash
npm run typecheck
```

### ESLint

```bash
npm run lint
```

### Unit Tests

```bash
npm test
```

### End-to-End Tests

```bash
npm run test:e2e
```

### Safe Verification Bundle

```bash
npm run verify
```

This runs the structural import check, lint, TypeScript validation, unit tests, and a production build. For the full browser journey as well:

```bash
npm run verify:full
```

---

## 🌐 Deploying with Vercel

LumaPath is designed to deploy directly from the GitHub `main` branch.

### Vercel Configuration

```text
Framework Preset : Next.js
Root Directory   : ./
Build Command    : npm run build
Install Command  : npm install
Production Branch: main
```

After GitHub and Vercel are connected:

```bash
git add .
git commit -m "Update LumaPath"
git push origin main
```

A push to `main` can automatically trigger a new production deployment.

---

## 🔀 Recommended Git Workflow

```text
Feature / Prototype Branch
          ↓
      Development
          ↓
        Testing
          ↓
   Pull Request / Merge
          ↓
         main
          ↓
       GitHub
          ↓
        Vercel
          ↓
 Production Deployment
```

---

## 🏷️ Releases

Stable versions of LumaPath can be published using GitHub Releases.

Versioning follows semantic versioning:

```text
v1.0.0
v1.0.1
v1.1.0
v2.0.0
```

Example:

```bash
git checkout main
git pull origin main
git tag -a v1.0.0 -m "LumaPath AI v1.0.0"
git push origin v1.0.0
```

Using GitHub CLI:

```bash
gh release create v1.0.0 \
  --repo IT24103430/LumaPath-AI \
  --title "LumaPath AI v1.0.0" \
  --generate-notes
```

---

## 📦 GitHub Packages

LumaPath can also publish Docker images through **GitHub Container Registry (GHCR)**.

Example package:

```text
ghcr.io/it24103430/lumapath-ai
```

Example version tags:

```text
ghcr.io/it24103430/lumapath-ai:1.0.0
ghcr.io/it24103430/lumapath-ai:1.0
ghcr.io/it24103430/lumapath-ai:latest
```

GitHub Actions can automatically build and publish the container whenever a release tag is pushed.

```text
Push Version Tag
       ↓
GitHub Actions
       ↓
Docker Build
       ↓
GitHub Container Registry
       ↓
GitHub Packages
```

---

## 🔐 Security & Responsible Design

The current version is a competition prototype.

Important design boundaries include:

- no production authentication claims
- no sensitive production database
- no payment processing
- no medical diagnosis
- no accredited certificate claims
- no fabricated public verification
- no external credentials required for the current prototype
- browser-local prototype data

A production version would require proper:

- authentication
- authorization
- backend APIs
- database isolation
- encryption
- audit logging
- secrets management
- privacy controls
- server-side validation

---

## 🗺️ Future Development

Potential production extensions include:

- multi-user authentication
- production backend APIs
- cloud database
- university LMS integrations
- calendar integrations
- real notification services
- broader career pathways
- internship intelligence
- advanced recommendation systems
- secure user data synchronization
- public portfolio integrations
- production-grade analytics
- AI-assisted explanations using approved student context

---

## 📌 Repository

**GitHub**

https://github.com/IT24103430/LumaPath-AI

---

## 👨‍💻 Development

LumaPath AI is being developed as a student innovation project focused on combining:

**Academic Planning + Student Capacity + Career Readiness**

into one adaptive decision-support experience.

---

## 📄 License

This project is currently developed for educational, research, demonstration, and competition purposes.

Copyright © 2026 LumaPath AI.

---

<div align="center">

### LumaPath AI

**Know what to do next. Stay on track. Build your future.**

⭐ If you find the project interesting, consider starring the repository.

</div>

## Learning Discovery Backend & Filters

The prototype now includes a small server-side learning-discovery layer while retaining a deterministic local fallback for demo reliability.

- `POST /api/learning/recommendations` validates the selected skill, onboarding preferences, and resource filters before returning personalized ranked resources.
- `GET /api/health` provides a lightweight backend health response.
- Learning resources have explicit content types: course, video, notes, documentation, lab, and project.
- Filters support search, content type, difficulty, cost, certificate availability, and maximum duration.
- Ranking still enforces the student's language, budget, assessed skill level, certificate preference, learning format, and weekly learning capacity.
- If the API cannot be reached during the demo, the client uses the same deterministic ranking logic locally instead of breaking the learning page.

See `docs/jira-backlog-status-suggested.md` for a code-derived Jira verification checklist.

---

## Study Assistant · DOC-F08

The prototype now includes a context-aware Study Assistant at `/study-assistant` with five explicit modes: concept explanation, revision planning, quiz generation, assignment breakdown, and today's study suggestion.

The UI keeps the existing LumaPath visual system and requires an authorised module/task/learning objective before a request can be sent. Responses are structured, show context/citations and a `Why this suggestion?` explanation, and keep generated planner/task/quiz actions behind a review-and-approve gate.
Structured assistant sessions, approved actions, feedback and audit metadata are persisted in SQLite while raw prompts are deliberately excluded from the schema.

A modular FastAPI sidecar now lives under `apps/api`. Start it with:

```bash
python -m pip install -e "./apps/api[test]"
npm run dev:api
```

Then start the existing web app with `npm run dev`. The Next.js server proxies Study Assistant traffic to FastAPI using `LUMAPATH_API_URL` (default `http://127.0.0.1:8000`).

See [`docs/study-assistant.md`](docs/study-assistant.md) for contracts, privacy/security boundaries, tests, failure handling, and the current prototype authentication limitation.

---

## Document Intelligence · DOC-F09

The prototype now includes a private Document Intelligence workspace at `/documents` for PDF, PPTX, DOCX and UTF-8 TXT study material. Uploads are size/MIME/magic-byte validated, stored under random private names, and processed asynchronously into source-grounded summaries, learning outcomes, unconfirmed date candidates, study-time estimates, editable flashcards, quizzes and reviewable planner actions.

Nothing extracted from a document is treated as an authoritative deadline automatically. Date/task proposals require explicit review, and the backend re-checks ownership, source references, current planning capacity and planner conflicts before approval. Source files and all derived chunks/results/actions can be deleted together and expire under a configurable retention policy.

The development worker uses a bounded thread pool and private local storage behind replaceable interfaces; production deployments can swap in a durable queue and private cloud object store without changing the HTTP/UI contract. ClamAV is used when available and can be required for release deployments.

See [`docs/document-intelligence.md`](docs/document-intelligence.md) for the API/data/security contract and [`docs/DOC-F09-verification.md`](docs/DOC-F09-verification.md) for acceptance-criteria traceability.



## Progress Analytics · DOC-F18

The `/analytics` workspace now uses a private FastAPI analytics service instead of prototype-only client calculations. It stores append-only, owner-scoped metric events; builds revisioned daily/weekly aggregates with timezone-aware boundaries; and exposes selected-period trends for completed work, explicit missed deadlines, productive time, module workload/difficulty, readiness, skill progress, estimate alignment and plan adjustment patterns.

Every metric carries a documented definition, measurement kind (`measured`, `estimated`, or `mixed`), partial/empty metadata and freshness information. Students can drill into structured source references and return to Tasks, Planner or Career Path to correct source data. LumaPath does not infer health, ability or motivation and exposes no public leaderboard/cohort comparison.

See [`docs/analytics.md`](docs/analytics.md) for metric/data contracts and [`docs/DOC-F18-verification.md`](docs/DOC-F18-verification.md) for acceptance-criteria traceability.

---

## Focus Sessions · DOC-F19

The `/focus` workspace is now a persisted, task-linked focus flow rather than a demo countdown. Students can launch it from Next Best Action or any active task, confirm a clear objective, choose work/break timing, pause/resume, leave freely, and review progress before anything is recorded.

Running time is reconstructed from durable timestamps and a heartbeat lease so refreshes remain stable and laptop sleep/offline gaps are auto-paused instead of inflating productive time. Completed sessions can update task progress, attach notes/next steps and transparently suggest a future duration estimate; interrupted or abandoned sessions remain in history but add zero completed productive minutes.

Browser break notifications are opt-in, no audio/device surveillance or website blocking is introduced, and every server session is owner-scoped.

See [`docs/focus-sessions.md`](docs/focus-sessions.md) for the timer/API/privacy contract and [`docs/DOC-F19-verification.md`](docs/DOC-F19-verification.md) for acceptance-criteria traceability.

---

## Multilingual interface · DOC-F22

LumaPath now has a versioned internationalisation layer for English (`en`), Sinhala (`si-LK`) and Tamil (`ta-LK`). Students can choose the interface language during onboarding or in Settings without resetting their current work. The preference is owner-scoped in FastAPI/SQLite and mirrored locally for fast startup/offline use.

Core navigation and priority workflows—including Tasks, Planner, Focus, Study Assistant, Documents and Analytics—use stable message keys and locale-aware `Intl` formatting. Missing translated keys fall back to English instead of exposing identifiers, and privacy-safe missing-key reports store only the locale, message key and translation-resource version.

Study Assistant requests carry the requested locale explicitly. Generated Sinhala/Tamil output is script-coverage validated; if it cannot be validated, LumaPath keeps the selected interface locale and clearly discloses an English assistant-response fallback. Source quotations, task/module names and technical identifiers are intentionally kept exact when translation could change academic meaning.

CI includes catalog parity/placeholder checks and pseudo-localisation expansion. A Sinhala/Tamil glossary and native-speaker review workflow are documented separately; automated checks do not claim to certify linguistic quality.

See [`docs/internationalization.md`](docs/internationalization.md), [`docs/i18n-glossary.md`](docs/i18n-glossary.md), [`docs/i18n-review-workflow.md`](docs/i18n-review-workflow.md) and [`docs/DOC-F22-verification.md`](docs/DOC-F22-verification.md).

## Portfolio Intelligence · DOC-F14

The prototype now includes an owner-scoped Portfolio workspace at `/portfolio`. Students can add projects manually, run transparent completeness checks, review role-skill evidence, edit factual project descriptions, and accept or dismiss evidence-linked improvements and project ideas. Manual claims remain `self_reported`; a skill with no matching evidence is labelled `not_demonstrated` for that project rather than treated as a judgment of student ability.

DOC-F14 deliberately does **not** connect GitHub/Jira or store source-control tokens. A future explicitly authorised integration can pass a normalized snapshot for one selected repository through a narrow import contract; imported data can be marked stale, refresh access can be revoked, and imported facts plus derived analysis can be deleted without removing the manual project.

See [`docs/portfolio.md`](docs/portfolio.md) and [`docs/DOC-F14-verification.md`](docs/DOC-F14-verification.md).

---

## CV Intelligence · DOC-F15

The `/cv` workspace now supports private PDF/DOCX/TXT upload or paste-in, explicit 7/30/90-day retention, reviewable parsed sections, deterministic role/ATS/readability checks, evidence-aware skill mapping and editable improvement drafts. Analysis is blocked until the student confirms the parsed sections, and accepted drafts are exported separately rather than silently rewriting the original CV.

DOC-F15 does not send CV content to an LLM or third party. It never fabricates employers, dates, qualifications, metrics or achievements; missing outcomes are returned as evidence questions. Source files, analysis snapshots or the full CV record can be deleted independently, and the owner boundary is enforced server-side.

See [`docs/cv-intelligence.md`](docs/cv-intelligence.md) and [`docs/DOC-F15-verification.md`](docs/DOC-F15-verification.md).


## DOC-F16

Internship Applications provide private opportunity tracking, status history, evidence-linked preparation and confirmed Planner/reminder actions without employer outreach.

## Interview Practice · DOC-F17

LumaPath now includes a private Interview Practice workspace at `/interviews`. Students can choose a supported career role, level and technical/behavioural/project round, recover timed sessions after refresh, receive transparent versioned rubric feedback, and add selected evidence-linked study topics to the existing career-learning roadmap. Practice scores are explicitly not hiring predictions or employment decisions. Text-only practice is first-class; recording storage is never implied or enabled without explicit consent, and DOC-F17 stores no audio/video bytes.


## Calendar Integration · DOC-F23

The `/calendar-sync` workspace now supports reviewed `.ics` and UTF-8 `.csv` academic calendar import. LumaPath normalizes source timezones, recurrence and source identity, previews duplicates/conflicts/changes/deletions, and changes Tasks/Planner only after explicit per-item approval. Imported deadlines become source-traceable Academic tasks; lectures, exams, workshops and other approved events become fixed Planner blocks. Personal title/time overrides survive later source syncs.

DOC-F23 does **not** connect a real university or LMS. A provider-neutral connector contract exists for a later explicit authorization flow, with minimum read scopes, server-side Fernet credential encryption, revoke/credential deletion and fail-closed provider errors. Approved non-deadline calendar items now feed DOC-F20's existing notification policy, while assignment deadlines continue through the Task deadline path to avoid duplicate alerts.

See [`docs/calendar-integration.md`](docs/calendar-integration.md) and [`docs/DOC-F23-verification.md`](docs/DOC-F23-verification.md).

---

## Career Learning Roadmap · DOC-F13

The new `/roadmap` workspace turns the prerequisite-aware Career Path into a versioned, capacity-aware weekly learning journey. Students choose a target role, goal and pace; review an ordered milestone/resource roadmap; approve or reject it; and explicitly select only prerequisite-ready weekly actions for Planner. Recalculation creates a separate explained draft, so goal, skill-evidence or capacity changes cannot silently overwrite completed work or the active plan.

Weekly allocation protects urgent academic obligations and current Planner occupancy, preserves transferable completed/verified skills after goal changes, and exposes resource source/cost/language/format instead of guessing missing facts. Resource accept/defer/replace decisions are retained so later recommendations can respond to student feedback.

DOC-F29 is now the server-owned career taxonomy/assessment engine. DOC-F13 still owns roadmap versioning, approval and Planner handoff, but production roadmap generation now consumes DOC-F29's validated role graph, ranked resources and latest owner-scoped skill assessment. `pathways/definitions.py` remains only as a compatibility export for older callers/tests.

See [`docs/roadmap.md`](docs/roadmap.md) and [`docs/DOC-F13-verification.md`](docs/DOC-F13-verification.md).

## Private Achievements & Consistency · DOC-F27

LumaPath now includes a private `/achievements` workspace backed by versioned rule definitions and evidence-linked domain records. Awards cover planning/task completion, on-time deadlines, non-punitive Focus consistency, Portfolio/CV progress, Internship milestones and Career Roadmap milestones. Celebrations are opt-in, streak visibility can be disabled independently, and there is no leaderboard, rank or public comparison surface.

A one-day grace rule prevents a single missed day from creating loss framing. Historic milestones remain earned after normal rest; if source evidence is actually corrected/deleted, the award is retained as private history with `evidence_status=withdrawn` rather than silently representing unsupported evidence as current.

See [`docs/achievements.md`](docs/achievements.md) and [`docs/DOC-F27-verification.md`](docs/DOC-F27-verification.md).


## Opportunity Recommendations (DOC-F28)

The cumulative build includes `/opportunities`, a private explainable catalogue/recommendation workflow covering internships, hackathons, competitions, workshops, scholarships, certifications and university events. It supports unpersonalized browsing, privacy-minimal ranking context, tri-state eligibility, source freshness/trust filtering, sponsored disclosure, private save/dismiss/report feedback, Planner preparation actions and DOC-F16 internship handoff. See `docs/opportunity-recommendations.md` and `docs/DOC-F28-verification.md`.

### Opportunity Readiness (DOC-F32)

The same `/opportunities` workspace now adds versioned prerequisites and source validation, requirement-by-requirement `met` / `unmet` / `unknown` explanations grounded in the active DOC-F29 pathway and Evidence Passport when personalization is enabled, editable capacity-aware preparation proposals, explicit idempotent Planner approval, and private Interested → Preparing → Applied → Follow-up → Result tracking. Stale/expired/untrusted/reported sources stop active recommendations and deadline alerts. See `docs/opportunity-readiness.md` and `docs/DOC-F32-verification.md`.


## Career Pathway Engine · DOC-F29

The `/career-path` workspace now uses a server-owned, versioned career taxonomy and evidence-aware skill assessment. Students can review required proficiency/prerequisites/evidence targets, combine low-confidence self assessment with available quiz/Portfolio/repository/CV/prior-roadmap evidence, inspect confidence and conflicts, and compare ranked courses/certificates/tutorials/projects before creating a DOC-F13 roadmap. The approved taxonomy is graph-validated; unknown skills and silent AI-generated role requirements are rejected.

Target-date feasibility is explicit: LumaPath never exceeds declared weekly capacity to manufacture an achievable date. Recalculation preserves transferable completion and requires approval before replacing the active roadmap.

See [`docs/career-pathway-engine.md`](docs/career-pathway-engine.md) and [`docs/DOC-F29-verification.md`](docs/DOC-F29-verification.md).

## Daily Learning & Market Intelligence · DOC-F30

The existing `/intelligence` workspace now uses a governed, server-owned daily feed rather than seeded demo news. Only metadata/permitted excerpts from the approved `content_sources` catalogue can enter the pipeline. Canonical URL normalisation, source/category trust thresholds, expiry, duplicate detection and quarantine are enforced before ranking; security and certification claims require authoritative source types. No open-web scraper or full-article republishing is shipped.

Today's ranking is deterministic and auditable against the approved DOC-F29 Career Path: current pathway step/skill, target role, difficulty fit, freshness, source trust and private save/dismiss/report/plan interactions contribute to the score, followed by source/category diversity caps. Every item shows its publisher, publication/freshness metadata and a grounded “why this matters to you” explanation with ranking/explanation versions. Save, dismiss, report and idempotent Planner handoff are supported; reported content is quarantined for review. If the student has no approved pathway or no fresh trusted content, LumaPath returns an explicit empty/failure state instead of manufacturing or recycling updates.

See [`docs/api/DOC-F30-daily-intelligence.md`](docs/api/DOC-F30-daily-intelligence.md) and [`docs/product/DOC-F30-verification.md`](docs/product/DOC-F30-verification.md).

## Evidence Passport · DOC-F31

The `/evidence` workspace is now backed by a private, server-owned skill-to-evidence graph. It synchronizes provenance from DOC-F14 Portfolio/repository/live-demo evidence and DOC-F29 assessments, supports self-declared certificate metadata and explicit DOC-F24 mentor validation requests, and keeps verification status/confidence transparent (`observed`, `reviewed`, `self_declared`, `stale`, `disputed`, `expired`). Source correction/deletion weakens evidence rather than leaving stale proof active.

Students can explicitly select evidence for a recruiter-ready text export or a time-bound share link. Share tokens are hashed at rest, are capped at 30 days, can be revoked immediately, and expose only the selected evidence summaries/safe provenance—not correction notes, internal source IDs, CV sources, repository credentials/private contents, interview data, mentor conversations, check-ins or uploaded study files. DOC-F29 now consumes active Passport evidence during skill assessment so readiness responds to evidence status rather than course completion alone.

See [`docs/evidence-passport.md`](docs/evidence-passport.md) and [`docs/DOC-F31-verification.md`](docs/DOC-F31-verification.md).


## Team Workspaces · DOC-F21

The `/teams` workspace adds consent-minimal group collaboration with one-time expiring invitations, owner/coordinator/member roles, explicit project ownership, shared milestones/tasks/dependencies/comments/meeting notes and append-only activity history. Optional allocation suggestions use only each member's explicitly shared weekly team-work allowance and selected skill-assessment summary; they never read private capacity/check-ins, grades, CV content or personal Tasks, and every assignment requires human confirmation.

Contribution history is factual and correctable through immutable correction events. It intentionally contains no leaderboard, effort score or automated judgement of member quality. Membership removal/leave and invitation expiry are enforced server-side immediately.

See [`docs/team-workspaces.md`](docs/team-workspaces.md) and [`docs/DOC-F21-verification.md`](docs/DOC-F21-verification.md).

## Governed Market Signals & Taxonomy · DOC-F34

The `/market-signals` workspace separates **observed labour-market evidence** from the approved role/skill taxonomy. Governed aggregate job signals, official certification-objective mappings and trusted technology-source metadata can produce versioned emerging/stable/declining signals with sample size, region, recency, confidence, methodology and provenance. Signals never edit the taxonomy automatically: proposal creation produces an immutable draft taxonomy snapshot, submission moves that snapshot to human review, and only a `taxonomy_reviewer` can approve publication or publish a reversible rollback version.

International and regional profiles are versioned separately. Server-side curator region scope is enforced on source administration, ingestion, signal computation, proposals, versions and unfiltered listings, while students can compare approved regional/international profiles without changing their active goal. Approved international changes create an owner-scoped impact preview and normal in-app roadmap notification; the existing pathway remains active until the student explicitly requests a recalculated draft and later approves that draft through the Roadmap flow.

See [`docs/market-taxonomy.md`](docs/market-taxonomy.md) and [`docs/DOC-F34-verification.md`](docs/DOC-F34-verification.md).
