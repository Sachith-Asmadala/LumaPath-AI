from __future__ import annotations

from dataclasses import dataclass

RANKING_VERSION = "2026-10-doc-f30-rank-v1"
EXPLANATION_VERSION = "2026-10-doc-f30-explain-v1"
INGESTION_VERSION = "2026-10-doc-f30-ingest-v1"

CATEGORY_LABELS = {
    "learning_article": "Learning article",
    "official_release": "Official release",
    "security_update": "Security update",
    "industry_news": "Industry news",
    "certification_change": "Certification change",
}

CATEGORY_TRUST_MINIMUM = {
    "learning_article": 75,
    "official_release": 85,
    "security_update": 90,
    "industry_news": 80,
    "certification_change": 90,
}

SENSITIVE_CATEGORY_SOURCE_TYPES = {
    "security_update": {"security_authority", "official_vendor"},
    "certification_change": {"certification_authority", "official_vendor", "foundation"},
    "official_release": {"official_vendor", "foundation", "security_authority", "certification_authority"},
}


SKILL_KEYWORDS = {
    "docker": ("docker", "container", "containers"),
    "kubernetes": ("kubernetes", "k8s", "cluster"),
    "cicd": ("ci/cd", "continuous integration", "continuous delivery", "pipeline", "github actions"),
    "git": ("git", "github", "version control"),
    "linux": ("linux", "shell", "bash"),
    "terraform": ("terraform", "infrastructure as code", "iac"),
    "cloud": ("cloud", "aws", "azure", "gcp"),
    "monitoring": ("monitoring", "observability", "metrics", "logging", "tracing"),
    "networking": ("network", "networking", "dns", "tcp", "http", "load balancer"),
    "security": ("security", "vulnerability", "cve", "iam", "patch"),
}

TOPIC_KEYWORDS = {
    "security": ("security", "vulnerability", "cve", "advisory", "patch"),
    "release": ("release", "version", "changelog", "upgrade"),
    "certification": ("certification", "exam", "credential"),
    "devops": ("devops", "pipeline", "deployment", "container", "kubernetes", "terraform"),
}

TRACKING_QUERY_PREFIXES = ("utm_",)
TRACKING_QUERY_KEYS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"}


@dataclass(frozen=True, slots=True)
class ApprovedSourceDefinition:
    id: str
    name: str
    base_url: str
    allowed_domains: tuple[str, ...]
    categories: tuple[str, ...]
    source_type: str
    trust_score: int
    storage_policy: str
    max_excerpt_chars: int
    max_age_days: int
    terms_url: str


# Governance catalogue only. It does not scrape or fabricate content. A worker/provider adapter
# may ingest metadata from these domains after publisher terms and provider-specific contracts are
# reviewed. The catalogue can be replaced/extended by a governed configuration source later.
APPROVED_SOURCES: tuple[ApprovedSourceDefinition, ...] = (
    ApprovedSourceDefinition(
        id="kubernetes-official",
        name="Kubernetes Official",
        base_url="https://kubernetes.io",
        allowed_domains=("kubernetes.io",),
        categories=("learning_article", "official_release"),
        source_type="foundation",
        trust_score=98,
        storage_policy="metadata_excerpt",
        max_excerpt_chars=360,
        max_age_days=45,
        terms_url="https://kubernetes.io/docs/home/",
    ),
    ApprovedSourceDefinition(
        id="docker-official",
        name="Docker Official",
        base_url="https://www.docker.com",
        allowed_domains=("docker.com", "docs.docker.com"),
        categories=("learning_article", "official_release", "security_update"),
        source_type="official_vendor",
        trust_score=98,
        storage_policy="metadata_excerpt",
        max_excerpt_chars=360,
        max_age_days=45,
        terms_url="https://www.docker.com/legal/",
    ),
    ApprovedSourceDefinition(
        id="github-changelog",
        name="GitHub Changelog",
        base_url="https://github.blog/changelog/",
        allowed_domains=("github.blog",),
        categories=("official_release", "industry_news"),
        source_type="official_vendor",
        trust_score=96,
        storage_policy="metadata_excerpt",
        max_excerpt_chars=320,
        max_age_days=35,
        terms_url="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
    ),
    ApprovedSourceDefinition(
        id="cisa-security",
        name="CISA Cybersecurity Advisories",
        base_url="https://www.cisa.gov/news-events/cybersecurity-advisories",
        allowed_domains=("cisa.gov",),
        categories=("security_update",),
        source_type="security_authority",
        trust_score=100,
        storage_policy="metadata_excerpt",
        max_excerpt_chars=320,
        max_age_days=21,
        terms_url="https://www.cisa.gov/about-site",
    ),
    ApprovedSourceDefinition(
        id="linux-foundation-training",
        name="Linux Foundation Training & Certification",
        base_url="https://training.linuxfoundation.org",
        allowed_domains=("training.linuxfoundation.org", "linuxfoundation.org"),
        categories=("learning_article", "certification_change"),
        source_type="certification_authority",
        trust_score=98,
        storage_policy="metadata_excerpt",
        max_excerpt_chars=320,
        max_age_days=90,
        terms_url="https://www.linuxfoundation.org/legal/terms",
    ),
    ApprovedSourceDefinition(
        id="cncf-official",
        name="Cloud Native Computing Foundation",
        base_url="https://www.cncf.io",
        allowed_domains=("cncf.io",),
        categories=("industry_news", "certification_change", "learning_article"),
        source_type="foundation",
        trust_score=95,
        storage_policy="metadata_excerpt",
        max_excerpt_chars=320,
        max_age_days=60,
        terms_url="https://www.linuxfoundation.org/legal/terms",
    ),
)
