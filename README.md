# LumaPath AI

> **AI-powered student life, wellness, productivity, and career guidance SaaS platform.**

LumaPath AI is a production-level AI-powered student life guidance platform designed to help university students manage academic pressure, emotional wellness, productivity, career planning, and internship preparation through personalized AI mentoring, smart tracking, and scalable SaaS architecture.

The project is designed to demonstrate strong understanding of **Software Engineering**, **Distributed Systems**, **Cloud-Native Architecture**, **Microservices**, **DevOps**, **AI Integration**, and **secure backend engineering**.

---

## Table of Contents

- [About the Project](#about-the-project)
- [Project Vision](#project-vision)
- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Microservices Breakdown](#microservices-breakdown)
- [Database Design](#database-design)
- [AI Integration](#ai-integration)
- [Security Features](#security-features)
- [DevOps and Deployment](#devops-and-deployment)
- [Folder Structure](#folder-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
- [Roadmap](#roadmap)
- [Software Engineering Principles](#software-engineering-principles)
- [Distributed Systems Concepts](#distributed-systems-concepts)
- [Portfolio Value](#portfolio-value)
- [Project Status](#project-status)
- [License](#license)

---

## About the Project

Many university students face academic pressure, emotional burnout, career uncertainty, relationship stress, productivity issues, and internship preparation challenges. LumaPath AI brings these areas into one intelligent platform.

The platform acts as a digital student guidance assistant that helps students:

- Understand their stress and mood patterns
- Organize studies and daily goals
- Build consistent productivity habits
- Receive AI-powered academic and career guidance
- Prepare for internships and interviews
- Track career growth and technical skills
- Receive smart reminders and motivational support

LumaPath AI is not only a student support system. It is also designed as a technically strong SaaS product that can be showcased for internships, final-year projects, and software engineering portfolios.

---

## Project Vision

The goal of LumaPath AI is to become a complete student life operating system.

It combines:

- AI mentoring
- Emotional wellness support
- Productivity management
- Career growth tracking
- Personalized learning guidance
- Smart analytics
- Scalable cloud-native architecture

The platform is especially useful for Software Engineering, IT, and Computer Science students who need support in both academic life and career preparation.

---

## Core Features

### 1. AI Mentor Assistant

- Conversational AI mentor
- Academic guidance
- Emotional support guidance
- Career advice
- Productivity coaching
- Personalized recommendations
- Context-aware memory
- Safety-aware responses

### 2. Student Dashboard

- Mood tracking
- Stress level monitoring
- Daily journaling
- Goal tracking
- Study planning
- Habit tracking
- Productivity summary

### 3. Wellness and Journaling

- Daily mood check-ins
- Stress score tracking
- Journal entries
- Burnout signal detection
- Reflection history
- Emotional trend analysis

### 4. Productivity Management

- Study goals
- Daily tasks
- Habit streaks
- Smart reminders
- Study planning
- Focus session tracking

### 5. Internship and Career Module

- Skill roadmap generation
- Resume tracking
- Interview preparation
- Coding challenge planner
- GitHub progress tracking
- LinkedIn growth tracking
- Career readiness score

### 6. AI Analytics Engine

- Behavioral analysis
- Productivity insights
- Burnout risk prediction
- Learning recommendations
- Personalized improvement plans

### 7. Notification System

- Smart reminders
- Deadline alerts
- AI-generated encouragement
- Event-driven notifications
- Study and career nudges

---

## System Architecture

LumaPath AI follows a scalable microservices architecture with an API Gateway, independent backend services, event-driven communication, distributed caching, multiple databases, and AI integration.

```mermaid
flowchart LR
    U[Student User] --> FE[Next.js Frontend]

    FE --> GW[API Gateway]

    GW --> AUTH[Auth Service]
    GW --> USER[User Service]
    GW --> AI[AI Mentor Service]
    GW --> JOURNAL[Journaling Service]
    GW --> PROD[Productivity Service]
    GW --> CAREER[Career Service]
    GW --> ANALYTICS[Analytics Service]
    GW --> NOTIF[Notification Service]

    AUTH --> PG[(PostgreSQL)]
    USER --> PG
    PROD --> PG
    CAREER --> PG

    AI --> MONGO[(MongoDB)]
    JOURNAL --> MONGO

    GW --> REDIS[(Redis)]
    AUTH --> REDIS
    AI --> REDIS

    AI --> VECTOR[(Vector Database)]
    AI --> LLM[OpenAI / Claude API]

    JOURNAL --> KAFKA[Kafka Event Bus]
    PROD --> KAFKA
    CAREER --> KAFKA
    AI --> KAFKA

    KAFKA --> ANALYTICS
    KAFKA --> NOTIF

    NOTIF --> EMAIL[Email / Push Provider]

    subgraph Observability
        PROM[Prometheus]
        GRAF[Grafana]
        ELK[ELK Stack]
        TRACE[OpenTelemetry]
    end

    GW --> PROM
    AI --> PROM
    ANALYTICS --> PROM
    PROM --> GRAF
```

---

## Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Framer Motion
- Zustand or Redux
- Responsive SaaS UI
- Dark mode support

### Backend

- Node.js
- NestJS
- REST APIs
- Microservices architecture
- DTO validation
- Dependency injection
- Swagger / OpenAPI documentation

### Databases

- PostgreSQL for structured transactional data
- MongoDB for journaling and chat history
- Redis for caching, sessions, and rate limiting
- Vector database for AI memory and semantic search

### Message Broker

- Apache Kafka or RabbitMQ
- Event-driven notifications
- Analytics pipelines
- Async processing

### AI

- OpenAI API
- Claude API fallback
- RAG architecture
- Embeddings
- Vector search
- Context memory
- AI safety layer

### DevOps

- Docker
- Docker Compose
- Kubernetes
- GitHub Actions CI/CD
- Nginx
- AWS or GCP deployment
- Prometheus
- Grafana
- ELK Stack

---

## Microservices Breakdown

| Service | Responsibility |
|---|---|
| API Gateway | Central routing, authentication validation, rate limiting, request aggregation |
| Auth Service | Register, login, JWT, OAuth2, RBAC, refresh tokens |
| User Service | Student profiles, preferences, academic details |
| AI Mentor Service | AI chat, RAG, memory, recommendations, safety checks |
| Journaling Service | Mood tracking, stress logs, daily journal entries |
| Productivity Service | Goals, habits, tasks, study planning |
| Career Service | Skill roadmap, resume tracker, interview planner, GitHub tracking |
| Analytics Service | Burnout prediction, productivity insights, behavioral analysis |
| Notification Service | Reminders, deadline alerts, AI encouragement messages |
| Integration Service | GitHub, LinkedIn, calendar, external services |

---

## Database Design

### PostgreSQL

Used for structured and relational data:

- Users
- Student profiles
- Goals
- Habits
- Study plans
- Career roadmaps
- Skills
- Notifications
- Roles and permissions

### MongoDB

Used for flexible document-based data:

- Journal entries
- AI chat history
- Conversation summaries
- Mood logs
- Emotional reflection history

### Redis

Used for high-speed caching:

- Session caching
- JWT refresh token cache
- Rate limiting
- AI response caching
- Dashboard caching

### Vector Database

Used for AI memory and semantic search:

- User context embeddings
- Journal summary embeddings
- Career plan embeddings
- Study preference embeddings
- RAG retrieval data

---

## AI Integration

LumaPath AI uses AI to provide personalized student guidance.

### AI Flow

```mermaid
sequenceDiagram
    actor Student
    participant UI as Frontend
    participant API as API Gateway
    participant AI as AI Mentor Service
    participant DB as Memory Store
    participant VDB as Vector Database
    participant LLM as AI Provider

    Student->>UI: Sends message
    UI->>API: POST /ai/chat
    API->>AI: Forward authenticated request
    AI->>DB: Retrieve recent memory
    AI->>VDB: Retrieve relevant context
    AI->>LLM: Generate response
    LLM-->>AI: AI reply
    AI->>DB: Save conversation summary
    AI-->>API: Return response
    API-->>UI: Display AI guidance
```

### AI Capabilities

- Personalized study advice
- Productivity coaching
- Emotional support guidance
- Internship preparation guidance
- Resume improvement suggestions
- Burnout risk detection
- Context-aware recommendations
- Smart reminders

> Important: LumaPath AI provides supportive guidance only. It does not replace medical, psychological, or professional counseling services.

---

## Security Features

- JWT authentication
- OAuth2 login
- Role-Based Access Control
- Refresh token rotation
- Password hashing
- API rate limiting
- Input validation
- Request sanitization
- Secure environment variables
- Database encryption practices
- HTTPS/TLS support
- AI prompt injection protection
- Sensitive journal data protection
- Audit logging

---

## DevOps and Deployment

LumaPath AI is designed for cloud-native deployment.

### DevOps Features

- Dockerized frontend and backend services
- Docker Compose for local development
- Kubernetes deployment for production
- GitHub Actions CI/CD pipeline
- Nginx reverse proxy or ingress controller
- Environment-based configuration
- Secrets management
- Monitoring and alerting
- Centralized logging

### Deployment Pipeline

```mermaid
flowchart LR
    DEV[Developer Push] --> GIT[GitHub]
    GIT --> CI[GitHub Actions]
    CI --> TEST[Run Tests]
    TEST --> BUILD[Build Docker Images]
    BUILD --> REG[Push to Registry]
    REG --> STAGE[Deploy to Staging]
    STAGE --> QA[Smoke Testing]
    QA --> PROD[Deploy to Production]
    PROD --> MON[Monitor with Grafana]
```

---

## Folder Structure

```text
lumapath-ai/
├── apps/
│   ├── web/
│   ├── api-gateway/
│   ├── auth-service/
│   ├── user-service/
│   ├── ai-mentor-service/
│   ├── journaling-service/
│   ├── productivity-service/
│   ├── career-service/
│   ├── analytics-service/
│   └── notification-service/
│
├── packages/
│   ├── shared-types/
│   ├── common-utils/
│   ├── config/
│   └── logger/
│
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   ├── terraform/
│   └── nginx/
│
├── docs/
│   ├── architecture.md
│   ├── api-spec.md
│   ├── database-design.md
│   ├── deployment-guide.md
│   ├── security.md
│   ├── jira-workflow.md
│   └── diagrams/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml
│
├── docker-compose.yml
├── README.md
└── LICENSE
```

---

## Getting Started

### Prerequisites

Install the following tools:

- Node.js
- npm or pnpm
- Docker
- Docker Compose
- Git
- PostgreSQL
- MongoDB
- Redis

### Clone the Repository

```bash
git clone https://github.com/your-username/lumapath-ai.git
cd lumapath-ai
```

### Install Dependencies

```bash
npm install
```

or

```bash
pnpm install
```

### Start Local Services

```bash
docker-compose up -d
```

### Run Frontend

```bash
cd apps/web
npm run dev
```

### Run Backend Service

```bash
cd apps/api-gateway
npm run start:dev
```

---

## Environment Variables

Create a `.env` file for each service.

Example:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://user:password@localhost:5432/lumapath
MONGODB_URI=mongodb://localhost:27017/lumapath
REDIS_URL=redis://localhost:6379

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

OPENAI_API_KEY=your_openai_api_key
CLAUDE_API_KEY=your_claude_api_key

KAFKA_BROKER=localhost:9092
```

> Never commit real API keys, database passwords, or secrets to GitHub.

---

## API Overview

### Auth Service

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register new student |
| POST | `/auth/login` | Login student |
| POST | `/auth/refresh` | Refresh JWT token |
| POST | `/auth/logout` | Logout user |
| GET | `/auth/me` | Get logged-in user |

### AI Mentor Service

| Method | Endpoint | Description |
|---|---|---|
| POST | `/ai/chat` | Send message to AI mentor |
| GET | `/ai/history/:id` | Get conversation history |
| POST | `/ai/recommendations` | Generate personalized recommendations |
| POST | `/ai/safety-check` | Check emotional risk level |

### Journaling Service

| Method | Endpoint | Description |
|---|---|---|
| POST | `/journals` | Create journal entry |
| GET | `/journals` | Get user journal entries |
| GET | `/journals/:id` | Get single journal entry |
| PATCH | `/journals/:id` | Update journal entry |
| DELETE | `/journals/:id` | Delete journal entry |

### Productivity Service

| Method | Endpoint | Description |
|---|---|---|
| POST | `/goals` | Create goal |
| GET | `/goals` | Get goals |
| POST | `/habits` | Create habit |
| PATCH | `/habits/:id/check-in` | Complete habit check-in |
| POST | `/study-plans` | Create study plan |

### Career Service

| Method | Endpoint | Description |
|---|---|---|
| POST | `/career/roadmap` | Generate career roadmap |
| GET | `/career/skills` | Get skill progress |
| PATCH | `/career/skills/:id` | Update skill progress |
| POST | `/career/interview-plan` | Generate interview plan |
| POST | `/career/resume-review` | Review resume using AI |

---

## Roadmap

### Phase 1: Foundation

- [ ] Create monorepo
- [ ] Build landing page
- [ ] Build dashboard UI
- [ ] Create API Gateway
- [ ] Set up authentication service
- [ ] Connect PostgreSQL
- [ ] Add Docker Compose

### Phase 2: Core Student Features

- [ ] Student profile management
- [ ] Mood tracking
- [ ] Stress monitoring
- [ ] Daily journaling
- [ ] Goal tracking
- [ ] Habit tracking

### Phase 3: AI Mentor

- [ ] AI chat interface
- [ ] OpenAI API integration
- [ ] Chat history storage
- [ ] AI response caching
- [ ] Safety response layer
- [ ] Context memory

### Phase 4: Career and Productivity

- [ ] Study planner
- [ ] Internship roadmap generator
- [ ] Resume tracker
- [ ] Interview preparation planner
- [ ] GitHub integration

### Phase 5: Distributed Systems

- [ ] Kafka event streaming
- [ ] Notification service
- [ ] Analytics service
- [ ] Redis rate limiting
- [ ] Circuit breaker and retry handling

### Phase 6: DevOps and Production

- [ ] Dockerfiles for services
- [ ] Kubernetes manifests
- [ ] GitHub Actions CI/CD
- [ ] Monitoring with Prometheus and Grafana
- [ ] Logging with ELK Stack
- [ ] Production deployment

---

## Software Engineering Principles

This project applies:

- SOLID principles
- DRY principle
- KISS principle
- Clean Architecture
- Hexagonal Architecture
- Domain-Driven Design
- Repository Pattern
- Service Layer Pattern
- Dependency Injection
- CQRS concepts
- Event-Driven Architecture
- API Gateway Pattern

---

## Distributed Systems Concepts

LumaPath AI demonstrates:

- Microservices architecture
- API Gateway
- Event-driven communication
- Message broker using Kafka or RabbitMQ
- Distributed caching using Redis
- Horizontal scaling
- Stateless services
- Load balancing
- Database replication concepts
- Eventual consistency
- Retry mechanisms
- Circuit breaker pattern
- Graceful degradation
- Observability
- Fault tolerance

---

## Observability

The platform is designed with production observability in mind.

Planned monitoring tools:

- Prometheus for metrics
- Grafana for dashboards
- ELK Stack for centralized logs
- OpenTelemetry for distributed tracing

Metrics to monitor:

- API latency
- Error rate
- AI response time
- AI token usage
- Kafka consumer lag
- Database query performance
- Redis cache hit rate
- Notification delivery rate

---

## Portfolio Value

LumaPath AI is designed as a portfolio-worthy project for:

- Software Engineering students
- IT students
- Backend developer internships
- Full-stack developer internships
- DevOps internships
- Cloud engineering roles
- AI application engineering roles

This project demonstrates the ability to design and build a real-world SaaS product with modern software engineering practices.

---

## Project Status

Current status:

- Project concept completed
- Architecture planned
- Frontend prototype in progress
- Jira workflow prepared
- Backend implementation planned
- DevOps pipeline planned

> This repository is actively being developed as a production-style academic and portfolio project.

---

## Future Improvements

- Mobile app using React Native or Expo
- Calendar integration
- University LMS integration
- Advanced AI analytics
- Team study groups
- Counselor/admin dashboard
- Premium SaaS subscription model
- Multi-region deployment
- Advanced recommendation engine

---

## License

This project is planned to be released under the MIT License.

---

## Author

Developed by **Sachith_Asmadala**

GitHub: https://github.com/your-username](https://github.com/Sachith-02

LinkedIn: https://linkedin.com/in/your-profile](https://linkedin.com/in/your-profile)](https://www.linkedin.com/in/sachith-asmadala-3b185a333

---

## Final Note

LumaPath AI is more than a normal student dashboard. It is designed as a scalable, AI-powered, cloud-native SaaS platform that combines student wellness, academic productivity, career preparation, and intelligent mentoring into one complete system.
