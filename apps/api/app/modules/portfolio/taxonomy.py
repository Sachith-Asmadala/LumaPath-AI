from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SkillRule:
    skill_id: str
    name: str
    keywords: tuple[str, ...] = ()
    indicators: tuple[str, ...] = ()


ROLE_TAXONOMY: dict[str, tuple[SkillRule, ...]] = {
    "DevOps Engineer": (
        SkillRule("linux", "Linux", ("linux", "bash", "shell")),
        SkillRule("git", "Git", ("git", "github", "gitlab")),
        SkillRule("networking", "Networking", ("networking", "http", "dns", "nginx")),
        SkillRule("docker", "Docker", ("docker", "container"), ("has_docker",)),
        SkillRule("cicd", "CI/CD", ("ci/cd", "github actions", "gitlab ci", "jenkins"), ("has_ci",)),
        SkillRule("cloud", "Cloud", ("aws", "azure", "gcp", "cloud")),
        SkillRule("terraform", "Terraform", ("terraform", "iac", "infrastructure as code"), ("has_iac",)),
        SkillRule("kubernetes", "Kubernetes", ("kubernetes", "k8s", "helm"), ("has_kubernetes",)),
        SkillRule("monitoring", "Monitoring", ("prometheus", "grafana", "monitoring", "observability"), ("has_monitoring",)),
    ),
    "Backend Engineer": (
        SkillRule("api", "API design", ("api", "rest", "graphql", "fastapi", "spring boot", "express")),
        SkillRule("database", "Databases", ("postgres", "mysql", "mongodb", "sql", "database")),
        SkillRule("testing", "Automated testing", ("pytest", "junit", "jest", "testing"), ("has_tests",)),
        SkillRule("security", "Backend security", ("oauth", "jwt", "rbac", "security")),
        SkillRule("docs", "API documentation", ("openapi", "swagger", "documentation"), ("has_documentation",)),
    ),
    "AI Engineer": (
        SkillRule("python", "Python", ("python",)),
        SkillRule("ml", "Machine learning", ("machine learning", "pytorch", "tensorflow", "scikit-learn", "sklearn")),
        SkillRule("data", "Data handling", ("pandas", "numpy", "dataset", "etl")),
        SkillRule("evaluation", "Model evaluation", ("evaluation", "metrics", "benchmark", "validation"), ("has_tests",)),
        SkillRule("deployment", "Model delivery", ("fastapi", "docker", "mlops", "serving"), ("has_docker", "has_ci")),
    ),
    "Cloud Engineer": (
        SkillRule("cloud", "Cloud services", ("aws", "azure", "gcp", "cloud")),
        SkillRule("iac", "Infrastructure as code", ("terraform", "cloudformation", "pulumi", "iac"), ("has_iac",)),
        SkillRule("containers", "Containers", ("docker", "kubernetes", "container"), ("has_docker", "has_kubernetes")),
        SkillRule("networking", "Cloud networking", ("vpc", "networking", "dns", "load balancer")),
        SkillRule("monitoring", "Monitoring", ("monitoring", "observability", "prometheus", "cloudwatch"), ("has_monitoring",)),
    ),
    "Cybersecurity Engineer": (
        SkillRule("security", "Security fundamentals", ("security", "owasp", "threat", "vulnerability")),
        SkillRule("linux", "Linux", ("linux", "bash", "shell")),
        SkillRule("networking", "Networking", ("networking", "tcp", "dns", "http")),
        SkillRule("automation", "Security automation", ("python", "bash", "automation")),
        SkillRule("testing", "Security testing", ("security test", "sast", "dast", "scan"), ("has_tests",)),
    ),
}


def role_skills(role: str) -> tuple[SkillRule, ...]:
    return ROLE_TAXONOMY.get(role, ROLE_TAXONOMY["DevOps Engineer"])
