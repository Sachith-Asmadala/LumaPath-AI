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

### 🔔 Notifications & Intelligence

The workspace contains contextual information and notifications related to:

- deadlines
- learning
- career progress
- planning
- changing priorities

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

```text
LumaPath-AI/
│
├── public/
│   └── brand/
│
├── src/
│   ├── app/
│   │   ├── assessment/
│   │   ├── login/
│   │   ├── onboarding/
│   │   ├── register/
│   │   └── (workspace)/
│   │       ├── analytics/
│   │       ├── career-path/
│   │       ├── evidence/
│   │       ├── focus/
│   │       ├── intelligence/
│   │       ├── learning/
│   │       ├── overview/
│   │       ├── planner/
│   │       ├── plans/
│   │       ├── settings/
│   │       ├── skills/
│   │       └── tasks/
│   │
│   ├── components/
│   ├── features/
│   └── lib/
│
├── tests/
│   └── e2e/
│
├── docs/
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

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

### Install Dependencies

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
