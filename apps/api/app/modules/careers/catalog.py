from __future__ import annotations

from dataclasses import dataclass


TAXONOMY_VERSION = "2026-10-v2"
DEFINITION_VERSION = TAXONOMY_VERSION


@dataclass(frozen=True, slots=True)
class PathwaySkillDefinition:
    skill_id: str
    name: str
    prerequisites: tuple[str, ...]
    estimated_minutes: int
    target_evidence: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ResourceDefinition:
    id: str
    skill_id: str
    title: str
    source: str
    source_url: str | None
    cost_type: str | None
    price_usd: float | None
    language: str | None
    format: str | None
    estimated_minutes: int | None


ROLE_PATHWAYS: dict[str, tuple[PathwaySkillDefinition, ...]] = {
    "DevOps Engineer": (
        PathwaySkillDefinition("linux", "Linux", (), 600, ("Explain shell, permissions, processes and services.", "Show a small Linux automation or troubleshooting artifact.")),
        PathwaySkillDefinition("git", "Git", (), 480, ("Show branch, merge and review workflow evidence.", "Explain version-control decisions in a project.")),
        PathwaySkillDefinition("networking", "Networking", ("linux",), 600, ("Explain DNS, HTTP, ports and service connectivity.", "Show a troubleshooting checklist or request-flow diagram.")),
        PathwaySkillDefinition("docker", "Docker", ("linux", "networking"), 1080, ("Build and run a containerized service.", "Show Dockerfile, networking and repeatable run instructions.")),
        PathwaySkillDefinition("cicd", "CI/CD", ("git", "docker"), 1080, ("Show a pipeline with build/test stages.", "Explain failure handling, secrets and deployment approval.")),
        PathwaySkillDefinition("cloud", "Cloud", ("networking",), 1080, ("Explain compute, storage, networking and identity choices.", "Show an architecture or deployment artifact.")),
        PathwaySkillDefinition("terraform", "Terraform", ("git", "cloud"), 1200, ("Show versioned infrastructure configuration.", "Explain plan, state, apply and cleanup behavior.")),
        PathwaySkillDefinition("kubernetes", "Kubernetes", ("docker", "networking"), 1440, ("Show Deployment and Service manifests.", "Explain readiness, rollout and rollback behavior.")),
        PathwaySkillDefinition("monitoring", "Monitoring", ("kubernetes",), 840, ("Show useful service metrics and an alert.", "Explain a basic incident/runbook response.")),
    ),
    "Backend Engineer": (
        PathwaySkillDefinition("api", "API design", (), 720, ("Design a clear resource API.", "Show validation, error handling and versioning choices.")),
        PathwaySkillDefinition("database", "Databases", (), 720, ("Show a normalized data model and useful queries.", "Explain indexes and transaction boundaries.")),
        PathwaySkillDefinition("testing", "Automated testing", ("api",), 600, ("Show unit and integration tests.", "Explain important failure cases and fixtures.")),
        PathwaySkillDefinition("security", "Backend security", ("api",), 720, ("Show authentication/authorization boundaries.", "Explain input validation and secret handling.")),
        PathwaySkillDefinition("docs", "API documentation", ("api",), 360, ("Publish readable API documentation.", "Show setup and troubleshooting notes.")),
    ),
    "AI Engineer": (
        PathwaySkillDefinition("python", "Python", (), 600, ("Show clear Python structure and tests.", "Explain data transformations and error handling.")),
        PathwaySkillDefinition("data", "Data handling", ("python",), 720, ("Show a reproducible data pipeline.", "Explain data quality and leakage controls.")),
        PathwaySkillDefinition("ml", "Machine learning", ("python", "data"), 1200, ("Train a reproducible baseline model.", "Explain features, assumptions and limitations.")),
        PathwaySkillDefinition("evaluation", "Model evaluation", ("ml",), 720, ("Show a held-out evaluation and suitable metrics.", "Explain error analysis and baseline comparison.")),
        PathwaySkillDefinition("deployment", "Model delivery", ("ml", "evaluation"), 900, ("Expose a tested inference boundary.", "Show versioning, rollback and monitoring considerations.")),
    ),
    "Cloud Engineer": (
        PathwaySkillDefinition("cloud", "Cloud services", (), 900, ("Explain compute, storage, identity and cost choices.", "Show a small architecture or deployment.")),
        PathwaySkillDefinition("networking", "Cloud networking", ("cloud",), 720, ("Explain VPC/VNet, routing, DNS and load balancing.", "Show a network diagram or configuration.")),
        PathwaySkillDefinition("iac", "Infrastructure as code", ("cloud",), 1080, ("Show repeatable infrastructure configuration.", "Explain state and change review.")),
        PathwaySkillDefinition("containers", "Containers", ("cloud",), 900, ("Show a containerized workload.", "Explain image, runtime and networking choices.")),
        PathwaySkillDefinition("monitoring", "Monitoring", ("cloud",), 720, ("Show service health signals and alerts.", "Explain how an incident would be investigated.")),
    ),
    "Cybersecurity Engineer": (
        PathwaySkillDefinition("linux", "Linux", (), 600, ("Show secure Linux administration basics.", "Explain permissions, services and logs.")),
        PathwaySkillDefinition("networking", "Networking", ("linux",), 720, ("Explain TCP/IP, DNS and HTTP flows.", "Show packet/service troubleshooting evidence.")),
        PathwaySkillDefinition("security", "Security fundamentals", ("networking",), 900, ("Show threat-model or vulnerability reasoning.", "Explain risk, mitigation and verification.")),
        PathwaySkillDefinition("automation", "Security automation", ("linux",), 720, ("Show a safe automation/script workflow.", "Explain validation, logging and failure behavior.")),
        PathwaySkillDefinition("testing", "Security testing", ("security",), 900, ("Show a scoped security test plan.", "Explain findings, evidence and remediation verification.")),
    ),
}


# Every ranked resource exposes the facts DOC-F13 requires. A missing field is
# represented as None rather than guessed by the service.
RESOURCE_CATALOG: tuple[ResourceDefinition, ...] = (
    ResourceDefinition("linux-ubuntu-cli", "linux", "Command line for beginners", "Ubuntu", "https://ubuntu.com/tutorials/command-line-for-beginners", "free", 0, "English", "reading", 120),
    ResourceDefinition("linux-practice", "linux", "Linux evidence project", "LumaPath practice", None, "free", 0, "English", "project", 180),
    ResourceDefinition("git-book", "git", "Pro Git", "Git", "https://git-scm.com/book/en/v2", "free", 0, "English", "reading", 120),
    ResourceDefinition("git-practice", "git", "Branch-and-review evidence project", "LumaPath practice", None, "free", 0, "English", "project", 150),
    ResourceDefinition("networking-mdn", "networking", "How does the Internet work?", "MDN", "https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/How_does_the_Internet_work", "free", 0, "English", "reading", 120),
    ResourceDefinition("networking-practice", "networking", "Request-path troubleshooting practice", "LumaPath practice", None, "free", 0, "English", "project", 150),
    ResourceDefinition("docker-docs", "docker", "Get started with Docker", "Docker Docs", "https://docs.docker.com/get-started/", "free", 0, "English", "hands-on", 480),
    ResourceDefinition("docker-workshop", "docker", "Docker workshop", "Docker Docs", "https://docs.docker.com/get-started/workshop/", "free", 0, "English", "hands-on", 240),
    ResourceDefinition("cicd-actions", "cicd", "GitHub Actions quickstart", "GitHub Docs", "https://docs.github.com/en/actions/get-started/quickstart", "free", 0, "English", "hands-on", 180),
    ResourceDefinition("cicd-practice", "cicd", "CI/CD evidence project", "LumaPath practice", None, "free", 0, "English", "project", 240),
    ResourceDefinition("cloud-aws-overview", "cloud", "What is cloud computing?", "AWS Docs", "https://docs.aws.amazon.com/whitepapers/latest/aws-overview/what-is-cloud-computing.html", "free", 0, "English", "reading", 180),
    ResourceDefinition("cloud-practice", "cloud", "Cloud architecture evidence project", "LumaPath practice", None, "free", 0, "English", "project", 240),
    ResourceDefinition("terraform-hashicorp", "terraform", "Terraform Docker get started", "HashiCorp", "https://developer.hashicorp.com/terraform/tutorials/docker-get-started", "free", 0, "English", "hands-on", 300),
    ResourceDefinition("terraform-practice", "terraform", "Terraform evidence project", "LumaPath practice", None, "free", 0, "English", "project", 240),
    ResourceDefinition("kubernetes-basics", "kubernetes", "Kubernetes Basics", "Kubernetes Docs", "https://kubernetes.io/docs/tutorials/kubernetes-basics/", "free", 0, "English", "hands-on", 360),
    ResourceDefinition("kubernetes-practice", "kubernetes", "Kubernetes manifest project", "LumaPath practice", None, "free", 0, "English", "project", 300),
    ResourceDefinition("prometheus-start", "monitoring", "Getting started with Prometheus", "Prometheus", "https://prometheus.io/docs/tutorials/getting_started/", "free", 0, "English", "hands-on", 240),
    ResourceDefinition("monitoring-practice", "monitoring", "Monitoring runbook project", "LumaPath practice", None, "free", 0, "English", "project", 240),
    ResourceDefinition("fastapi-tutorial", "api", "FastAPI tutorial", "FastAPI", "https://fastapi.tiangolo.com/tutorial/", "free", 0, "English", "hands-on", 300),
    ResourceDefinition("api-practice", "api", "API design evidence project", "LumaPath practice", None, "free", 0, "English", "project", 240),
    ResourceDefinition("postgres-tutorial", "database", "PostgreSQL tutorial", "PostgreSQL", "https://www.postgresql.org/docs/current/tutorial.html", "free", 0, "English", "reading", 240),
    ResourceDefinition("database-practice", "database", "Database evidence project", "LumaPath practice", None, "free", 0, "English", "project", 240),
    ResourceDefinition("pytest-docs", "testing", "pytest documentation", "pytest", "https://docs.pytest.org/", "free", 0, "English", "hands-on", 180),
    ResourceDefinition("testing-practice", "testing", "Testing evidence project", "LumaPath practice", None, "free", 0, "English", "project", 180),
    ResourceDefinition("owasp-api", "security", "OWASP API Security Top 10", "OWASP", "https://owasp.org/API-Security/", "free", 0, "English", "reading", 180),
    ResourceDefinition("security-practice", "security", "Security review evidence project", "LumaPath practice", None, "free", 0, "English", "project", 240),
    ResourceDefinition("openapi-spec", "docs", "OpenAPI specification", "OpenAPI Initiative", "https://spec.openapis.org/oas/latest.html", "free", 0, "English", "reading", 120),
    ResourceDefinition("python-tutorial", "python", "Python tutorial", "Python", "https://docs.python.org/3/tutorial/", "free", 0, "English", "reading", 300),
    ResourceDefinition("pandas-start", "data", "Getting started with pandas", "pandas", "https://pandas.pydata.org/docs/getting_started/index.html", "free", 0, "English", "hands-on", 240),
    ResourceDefinition("sklearn-supervised", "ml", "Supervised learning guide", "scikit-learn", "https://scikit-learn.org/stable/supervised_learning.html", "free", 0, "English", "reading", 360),
    ResourceDefinition("sklearn-metrics", "evaluation", "Model evaluation", "scikit-learn", "https://scikit-learn.org/stable/modules/model_evaluation.html", "free", 0, "English", "reading", 240),
    ResourceDefinition("ml-delivery-practice", "deployment", "Model delivery evidence project", "LumaPath practice", None, "free", 0, "English", "project", 300),
    ResourceDefinition("terraform-cloud", "iac", "Terraform tutorials", "HashiCorp", "https://developer.hashicorp.com/terraform/tutorials", "free", 0, "English", "hands-on", 300),
    ResourceDefinition("docker-cloud", "containers", "Docker get started", "Docker Docs", "https://docs.docker.com/get-started/", "free", 0, "English", "hands-on", 300),
    ResourceDefinition("aws-vpc", "networking", "Amazon VPC documentation", "AWS Docs", "https://docs.aws.amazon.com/vpc/", "free", 0, "English", "reading", 240),
    ResourceDefinition("owasp-top10", "security", "OWASP Top 10", "OWASP", "https://owasp.org/www-project-top-ten/", "free", 0, "English", "reading", 180),
    ResourceDefinition("python-automation", "automation", "Python tutorial", "Python", "https://docs.python.org/3/tutorial/", "free", 0, "English", "hands-on", 240),
)


def pathway_for(role: str) -> tuple[PathwaySkillDefinition, ...]:
    return ROLE_PATHWAYS.get(role, ROLE_PATHWAYS["DevOps Engineer"])


def resources_for(skill_id: str) -> list[ResourceDefinition]:
    return [resource for resource in RESOURCE_CATALOG if resource.skill_id == skill_id]


def topological_order(definitions: tuple[PathwaySkillDefinition, ...] | list[PathwaySkillDefinition]) -> list[PathwaySkillDefinition]:
    by_id = {item.skill_id: item for item in definitions}
    incoming = {item.skill_id: set(item.prerequisites) for item in definitions}
    for item in definitions:
        unknown = set(item.prerequisites) - set(by_id)
        if unknown:
            raise ValueError(f"Pathway skill '{item.skill_id}' references unknown prerequisites: {', '.join(sorted(unknown))}.")
    ordered: list[PathwaySkillDefinition] = []
    ready = [item.skill_id for item in definitions if not incoming[item.skill_id]]
    # Definition order provides deterministic tie-breaking.
    definition_order = {item.skill_id: index for index, item in enumerate(definitions)}
    ready.sort(key=definition_order.get)
    while ready:
        skill_id = ready.pop(0)
        ordered.append(by_id[skill_id])
        for other in definitions:
            if skill_id not in incoming[other.skill_id]:
                continue
            incoming[other.skill_id].remove(skill_id)
            if not incoming[other.skill_id] and other.skill_id not in {item.skill_id for item in ordered} and other.skill_id not in ready:
                ready.append(other.skill_id)
                ready.sort(key=definition_order.get)
    if len(ordered) != len(definitions):
        cycle = sorted(skill_id for skill_id, values in incoming.items() if values)
        raise ValueError(f"Pathway prerequisite cycle detected involving: {', '.join(cycle)}.")
    return ordered


ROLE_METADATA: dict[str, dict[str, object]] = {
    "DevOps Engineer": {"id": "devops-engineer", "level": "entry_to_junior", "description": "Build, automate, deliver and observe reliable software infrastructure.", "quality_status": "approved"},
    "Backend Engineer": {"id": "backend-engineer", "level": "entry_to_junior", "description": "Design reliable APIs, data models, tests and backend security boundaries.", "quality_status": "approved"},
    "AI Engineer": {"id": "ai-engineer", "level": "entry_to_junior", "description": "Build reproducible data, model evaluation and model-delivery workflows.", "quality_status": "approved"},
    "Cloud Engineer": {"id": "cloud-engineer", "level": "entry_to_junior", "description": "Design and operate cloud infrastructure, networking and observability.", "quality_status": "approved"},
    "Cybersecurity Engineer": {"id": "cybersecurity-engineer", "level": "entry_to_junior", "description": "Apply security fundamentals, testing and safe automation to systems.", "quality_status": "approved"},
}

ROLE_REQUIRED_PROFICIENCY: dict[str, dict[str, int]] = {
    "DevOps Engineer": {"linux": 70, "git": 70, "networking": 65, "docker": 70, "cicd": 65, "cloud": 60, "terraform": 60, "kubernetes": 55, "monitoring": 55},
    "Backend Engineer": {"api": 70, "database": 70, "testing": 65, "security": 60, "docs": 55},
    "AI Engineer": {"python": 75, "data": 65, "ml": 65, "evaluation": 60, "deployment": 55},
    "Cloud Engineer": {"cloud": 70, "networking": 65, "iac": 65, "containers": 60, "monitoring": 55},
    "Cybersecurity Engineer": {"linux": 65, "networking": 70, "security": 70, "automation": 55, "testing": 60},
}

RESOURCE_TYPE_OVERRIDES: dict[str, str] = {
    "linux-practice": "project", "git-practice": "project", "networking-practice": "project", "cicd-practice": "project",
    "cloud-practice": "project", "terraform-practice": "project", "kubernetes-practice": "project", "monitoring-practice": "project",
    "api-practice": "project", "database-practice": "project", "testing-practice": "project", "security-practice": "project",
    "ml-delivery-practice": "project",
}


def role_requirement(role: str, skill_id: str) -> int:
    return ROLE_REQUIRED_PROFICIENCY.get(role, {}).get(skill_id, 60)


def resource_type(resource: ResourceDefinition) -> str:
    if resource.id in RESOURCE_TYPE_OVERRIDES:
        return RESOURCE_TYPE_OVERRIDES[resource.id]
    if resource.format == "reading":
        return "tutorial"
    if resource.format == "hands-on":
        return "course"
    if resource.format == "project":
        return "project"
    return "tutorial"


def resource_quality(resource: ResourceDefinition) -> int:
    # Deterministic editorial quality signal. It is not a learner-outcome guarantee.
    if resource.source == "LumaPath practice":
        return 76
    if resource.source_url and resource.cost_type == "free":
        return 88
    return 80

# DOC-F29 expands the catalogue to all required resource classes. Pricing is
# intentionally left unknown for certificates because provider fees can change;
# the UI must display unknown rather than guess.
RESOURCE_CATALOG = RESOURCE_CATALOG + (
    ResourceDefinition("cert-terraform-associate", "terraform", "Terraform Associate certification", "HashiCorp", "https://developer.hashicorp.com/certifications/infrastructure-automation", "paid", None, "English", "exam", None),
    ResourceDefinition("cert-kubernetes-kcna", "kubernetes", "Kubernetes and Cloud Native Associate", "CNCF", "https://www.cncf.io/training/certification/kcna/", "paid", None, "English", "exam", None),
    ResourceDefinition("cert-aws-cloud-practitioner", "cloud", "AWS Certified Cloud Practitioner", "AWS", "https://aws.amazon.com/certification/certified-cloud-practitioner/", "paid", None, "English", "exam", None),
    ResourceDefinition("cert-python-pcep", "python", "PCEP Python certification", "Python Institute", "https://pythoninstitute.org/pcep", "paid", None, "English", "exam", None),
)
RESOURCE_TYPE_OVERRIDES.update({
    "cert-terraform-associate": "certificate",
    "cert-kubernetes-kcna": "certificate",
    "cert-aws-cloud-practitioner": "certificate",
    "cert-python-pcep": "certificate",
})
RESOURCE_CATALOG = RESOURCE_CATALOG + (
    ResourceDefinition("docker-evidence-project", "docker", "Containerized service evidence project", "LumaPath practice", None, "free", 0, "English", "project", 240),
)
RESOURCE_TYPE_OVERRIDES["docker-evidence-project"] = "project"
