from __future__ import annotations

import re
from .schemas import CvSection

SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "profile", "professional summary", "career summary", "objective", "career objective"),
    "education": ("education", "academic background", "qualifications", "academic qualifications"),
    "experience": ("experience", "work experience", "employment", "professional experience", "internship", "internships"),
    "projects": ("projects", "project experience", "selected projects", "academic projects", "personal projects"),
    "skills": ("skills", "technical skills", "core skills", "technologies", "technical proficiency"),
    "certifications": ("certifications", "certificates", "licenses", "courses"),
}
CANONICAL_TITLES = {
    "contact": "Contact",
    "summary": "Summary",
    "education": "Education",
    "experience": "Experience",
    "projects": "Projects",
    "skills": "Skills",
    "certifications": "Certifications",
    "other": "Other",
}


def _heading_key(line: str) -> str | None:
    cleaned = re.sub(r"[^a-zA-Z ]+", " ", line).strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    for key, aliases in SECTION_ALIASES.items():
        if cleaned in aliases:
            return key
    return None


def parse_cv_sections(text: str) -> list[CvSection]:
    text = text.replace("\x00", " ").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    buckets: dict[str, list[str]] = {key: [] for key in CANONICAL_TITLES}
    current = "contact"
    seen_heading = False
    for line in lines:
        if not line:
            if buckets[current] and buckets[current][-1] != "":
                buckets[current].append("")
            continue
        heading = _heading_key(line)
        if heading:
            current = heading
            seen_heading = True
            continue
        if not seen_heading and current == "contact":
            buckets["contact"].append(line)
        else:
            buckets[current].append(line)
    if not seen_heading:
        content = "\n".join(item for item in lines if item).strip()
        contact_lines = [line for line in lines[:8] if re.search(r"@|\+?\d[\d\s().-]{7,}", line)]
        if contact_lines:
            buckets["contact"] = contact_lines
            remaining = content
            for line in contact_lines:
                remaining = remaining.replace(line, "", 1)
            buckets["other"] = [remaining.strip()]
        else:
            buckets["contact"] = []
            buckets["other"] = [content]
    result: list[CvSection] = []
    for key in ("contact", "summary", "education", "experience", "projects", "skills", "certifications", "other"):
        content = "\n".join(buckets[key]).strip()
        if content:
            result.append(CvSection(key=key, title=CANONICAL_TITLES[key], content=content))
    return result or [CvSection(key="other", title="Other", content=text.strip())]
