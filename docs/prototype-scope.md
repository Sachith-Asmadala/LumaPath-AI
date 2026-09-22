# hackX 11.0 Prototype Scope

## Purpose

This document defines the smallest coherent LumaPath AI prototype for the hackX 11.0 ideaX Semi-Finals. The prototype should demonstrate one complete loop: understand a student's context, identify risk, recommend the next action, build a plan, respond to change, and explain the result.

It is a focused subset of the full Student Success and Career Readiness vision described in the project [README](../README.md).

## Demo Persona

**Maya** is a university student whose career target is **DevOps Engineer**. She has academic deadlines, limited weekly capacity, and a developing set of technical skills.

## In Scope

1. A student profile containing relevant academic context and a career target
2. Academic tasks with deadlines, effort estimates, and progress
3. A simple capacity check-in covering available time and current workload
4. Transparent rules that identify deadline risk and priority
5. One recommended Next Best Action with visible reasons
6. A weekly plan constrained by available capacity
7. Replanning after a representative deadline or availability change
8. A basic career skill-gap view for the selected target
9. An explanation of why the academic and career recommendations were made

## Out of Scope for This Milestone

- Production authentication and authorisation
- Medical or psychological assessment
- A full conversational AI mentor or long-term memory
- Live university, GitHub, LinkedIn, calendar, or labour-market integrations
- Resume review, interview simulation, and internship matching
- Kafka or RabbitMQ, multiple microservices, and multiple databases
- Kubernetes, multi-region deployment, and a complete observability stack
- Institutional, counsellor, billing, or subscription features

## Decision Principle

> **Rules decide. Optimisation schedules. AI explains.**

Risk and priority outputs should be derived from inspectable student data and structured rules. Scheduling should respect declared constraints. If generative AI is included, it should communicate or personalise the structured result rather than silently making critical planning decisions.

## Proposed Demo Sequence

1. Open Maya's profile and DevOps Engineer goal.
2. Review her tasks, deadlines, and estimated effort.
3. Record her current capacity.
4. Display a detected deadline risk and its contributing factors.
5. Show the recommended Next Best Action.
6. Generate a capacity-aware weekly plan.
7. Change an exam date, deadline, or availability value.
8. Show the updated plan and explain the changed priorities.
9. Open the career view and show Maya's next skill gap.

## Acceptance Criteria

The first prototype is successful when it can demonstrate the sequence above with consistent sample data and without implying that planned platform features already exist. A reviewer should be able to see:

- which input caused a risk or recommendation;
- why the chosen action ranks above alternatives;
- how the plan fits the available capacity;
- what changed during replanning;
- which evidence supports current skill progress;
- which features are prototype functionality and which remain part of the roadmap.

## Current Status

This scope document is the first development foundation. There is currently no application implementation, dependency manifest, database schema, AI integration, test suite, or deployment configuration in the repository.
