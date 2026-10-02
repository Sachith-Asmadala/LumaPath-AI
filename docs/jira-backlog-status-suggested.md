# Jira Backlog Status — Suggested Prototype Updates

This file is generated from the code currently present in the reorganized LumaPath AI prototype. It is a **verification checklist**, not a claim that Jira was updated. Before moving a Jira item to Done, confirm its acceptance criteria match the implemented behavior.

## Implemented in the current prototype

- Landing page, login and registration screens
- Student onboarding/profile setup
- Baseline skills assessment and assessment history
- Career pathway / prerequisite graph
- Skill-gap and readiness logic
- Learning resource recommendation engine
- Budget, language, level, duration, certificate and preferred-format constraints
- Resource type filtering for courses, videos, notes, documentation, labs and projects
- Backend recommendation endpoint: `POST /api/learning/recommendations`
- Backend health endpoint: `GET /api/health`
- Curated video and notes resources in the prototype catalog
- Structured free learning paths
- Learning progress, knowledge checks and completion records
- Resource bookmarking
- Planner, capacity-aware scheduling and recovery/replanning logic
- Task management and smart deadline import prototype
- University LMS mock import flow
- Evidence Passport / project evidence
- Career readiness dashboard
- Career Intelligence feed and Opportunity Radar prototype
- Focus session feature
- Analytics workspace
- Notifications/workspace controls represented in demo state
- CI workflow, local import checker and organized feature/domain structure

## Items that should be marked Done only after acceptance-criteria review

1. Authentication: UI exists, but production identity/session persistence must be checked before calling backend auth complete.
2. Database persistence: current competition prototype still relies heavily on demo/browser state; do not mark production database stories Done unless the story only asks for prototype behavior.
3. Real provider integrations: learning links are a curated local catalog; live Coursera/Udemy/YouTube ingestion is not implemented.
4. University LMS integration: the current flow is a mock adapter, not a production LMS connection.
5. Career Intelligence ingestion: UI/domain prototype exists; verify whether the Jira story requires live RSS/API ingestion.
6. AI/LLM integration: verify whether each Jira story requires a live model or only deterministic prototype behavior.
7. Production notifications: verify delivery channel requirements before marking Done.
8. Institutional/mentor features: review individually; not all full-product functions are present in the prototype.

## New backlog items recommended for the learning discovery work

- Learning Discovery API — validate request and return ranked resources
- Resource Catalog Metadata — add content type, quality score and tags
- Learning Filters — video, notes, course, docs, lab, project, level, price, certificate and duration
- Curated Notes Resources — trusted revision/reference items by skill
- Curated Video Resources — ranked video-first resources by skill
- Recommendation Explainability — show profile constraints and reasons for ranking
- Recommendation API Fallback — keep local deterministic ranking if backend request fails
- Recommendation API tests — validation, filtering and ranking contract
- Future: provider ingestion jobs — fetch and normalize external resource metadata rather than hard-code catalog entries
