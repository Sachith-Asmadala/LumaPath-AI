from __future__ import annotations

from dataclasses import dataclass
from datetime import date

CATALOG_VERSION = "2026-11-v2"
REQUIREMENT_VERSION = "2026-11-v1"
ELIGIBILITY_ENGINE_VERSION = "eligibility-2026-11-v1"
PREPARATION_ENGINE_VERSION = "preparation-2026-11-v1"
FRESHNESS_DAYS = 30


@dataclass(frozen=True, slots=True)
class OpportunityDefinition:
    key: str
    category: str
    title: str
    provider: str
    summary: str
    starts_on: date | None
    closes_on: date | None
    location_mode: str
    location: str | None
    cost_type: str
    cost_amount: float | None
    currency: str | None
    target_roles: tuple[str, ...]
    required_skills: tuple[str, ...]
    useful_skills: tuple[str, ...]
    minimum_readiness: int | None
    eligibility: tuple[tuple[str, str, tuple[str, ...]], ...]
    application_steps: tuple[str, ...]
    source_url: str
    source_name: str
    source_checked_on: date
    trust_status: str = "curated"
    sponsored: bool = False
    sponsor_name: str | None = None


# Deterministic competition fixtures. They exercise the governed catalogue contract;
# they are not represented as independently verified live vacancies in the UI.
CATALOG: tuple[OpportunityDefinition, ...] = (
    OpportunityDefinition(
        "devops-intern-2026", "internship", "DevOps Engineering Internship", "Northstar Labs",
        "Hands-on internship focused on CI/CD, containers and cloud fundamentals.",
        date(2026, 11, 9), date(2026, 11, 28), "hybrid", "Colombo, Sri Lanka", "free", 0, "LKR",
        ("DevOps Engineer", "Cloud Engineer"), ("git", "docker"), ("cicd", "cloud"), 45,
        (("student_status", "Student status", ("undergraduate",)),),
        ("Review the official role and application instructions.", "Prepare a concise CV and evidence links.", "Submit through the provider's official application channel.", "Record the submission and plan a follow-up if the provider permits it."),
        "https://example.org/opportunities/devops-intern-2026", "Northstar Labs careers", date(2026, 10, 1),
    ),
    OpportunityDefinition(
        "open-source-hackathon", "hackathon", "Open Source Automation Hackathon", "FOSS Community",
        "A weekend team challenge around developer tooling and automation.",
        date(2026, 11, 14), date(2026, 11, 8), "online", None, "free", 0, "USD",
        ("DevOps Engineer", "Backend Engineer", "AI Engineer"), ("git",), ("automation", "python", "cicd"), 25,
        (),
        ("Review participation rules and team requirements.", "Prepare a repository and short project idea.", "Register through the official event page."),
        "https://example.org/opportunities/open-source-hackathon", "FOSS Community events", date(2026, 10, 1),
    ),
    OpportunityDefinition(
        "cloud-build-competition", "competition", "Cloud Build Challenge", "Cloud Skills Network",
        "Build and explain a small cloud solution with infrastructure and operational evidence.",
        date(2026, 12, 2), date(2026, 11, 20), "online", None, "free", 0, "USD",
        ("Cloud Engineer", "DevOps Engineer"), ("cloud",), ("iac", "containers", "monitoring"), 40,
        (),
        ("Review judging criteria and submission format.", "Prepare a small cloud build and evidence.", "Submit before the published closing date."),
        "https://example.org/opportunities/cloud-build-competition", "Cloud Skills Network", date(2026, 10, 1),
    ),
    OpportunityDefinition(
        "api-workshop", "workshop", "Production API Design Workshop", "Developer Guild",
        "Practical workshop on API boundaries, validation, testing and documentation.",
        date(2026, 10, 24), date(2026, 10, 22), "onsite", "Colombo, Sri Lanka", "free", 0, "LKR",
        ("Backend Engineer",), ("api",), ("testing", "security", "docs"), 20,
        (),
        ("Review the workshop prerequisites.", "Register using the official organiser page."),
        "https://example.org/opportunities/api-workshop", "Developer Guild", date(2026, 10, 1),
    ),
    OpportunityDefinition(
        "women-tech-scholarship", "scholarship", "Undergraduate Technology Scholarship", "Future Skills Foundation",
        "Tuition-support scholarship for eligible undergraduate technology students.",
        None, date(2026, 12, 15), "online", None, "free", 0, "LKR",
        ("DevOps Engineer", "Backend Engineer", "AI Engineer", "Cloud Engineer", "Cybersecurity Engineer"), (), (), None,
        (("student_status", "Student status", ("undergraduate",)), ("country", "Country", ("Sri Lanka",))),
        ("Read the official eligibility terms in full.", "Prepare the requested academic and identity documents.", "Complete the official application form."),
        "https://example.org/opportunities/technology-scholarship", "Future Skills Foundation", date(2026, 10, 1),
    ),
    OpportunityDefinition(
        "k8s-cert-prep", "certification", "Kubernetes Foundations Certification Prep", "Cloud Credential Academy",
        "Structured preparation pathway for Kubernetes fundamentals and practical cluster concepts.",
        date(2026, 11, 1), date(2026, 12, 31), "online", None, "paid", 19, "USD",
        ("DevOps Engineer", "Cloud Engineer"), ("docker", "networking"), ("kubernetes",), 35,
        (),
        ("Review the current certification syllabus and exam policy.", "Complete prerequisite practice before booking an exam."),
        "https://example.org/opportunities/kubernetes-cert-prep", "Cloud Credential Academy", date(2026, 10, 1),
        sponsored=True, sponsor_name="Cloud Credential Academy",
    ),
    OpportunityDefinition(
        "university-career-fair", "university_event", "Technology Career & Project Fair", "University Career Centre",
        "Meet employers, review student projects and attend short career-preparation sessions.",
        date(2026, 11, 6), date(2026, 11, 5), "onsite", "University campus", "free", 0, "LKR",
        ("DevOps Engineer", "Backend Engineer", "AI Engineer", "Cloud Engineer", "Cybersecurity Engineer"), (), (), None,
        (("student_status", "Student status", ("undergraduate",)),),
        ("Review event entry instructions.", "Prepare a short introduction and portfolio links.", "Register if the event page requires it."),
        "https://example.org/opportunities/career-fair", "University Career Centre", date(2026, 10, 1),
    ),
    # Guard fixtures proving trust/freshness/expiry gates.
    OpportunityDefinition(
        "quarantined-event", "workshop", "Unverified Career Webinar", "Unknown Provider",
        "Untrusted fixture that must never be recommended.", date(2026, 11, 1), date(2026, 10, 31), "online", None,
        "free", 0, "USD", (), (), (), None, (), ("Verify the organiser before taking action.",),
        "https://example.org/quarantined", "Unknown source", date(2026, 10, 1), trust_status="quarantined",
    ),
    OpportunityDefinition(
        "stale-internship", "internship", "Stale Internship Fixture", "Old Source",
        "Stale fixture that must not rank as current.", date(2026, 11, 1), date(2026, 10, 30), "onsite", "Colombo",
        "free", 0, "LKR", ("DevOps Engineer",), ("git",), (), 20, (), ("Verify the current vacancy at the source.",),
        "https://example.org/stale", "Old Source", date(2026, 7, 1),
    ),
    OpportunityDefinition(
        "expired-workshop", "workshop", "Expired Workshop Fixture", "Past Source",
        "Expired fixture that must not rank as current.", date(2026, 9, 25), date(2026, 9, 30), "online", None,
        "free", 0, "USD", (), (), (), None, (), ("This fixture is already closed.",),
        "https://example.org/expired", "Past Source", date(2026, 10, 1),
    ),
)
