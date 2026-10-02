from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import uuid4

from ..portfolio.taxonomy import role_skills
from .schemas import CvFinding, CvRoleSkill, CvSection

ANALYSIS_VERSION = "2026-10-v1"


@dataclass(frozen=True, slots=True)
class PortfolioEvidence:
    project_id: str
    project_title: str
    skill_id: str
    skill_name: str
    verification_status: str
    evidence: tuple[str, ...]
    description: str
    technologies: tuple[str, ...]


def _text(sections: list[CvSection]) -> str:
    return "\n".join(section.content for section in sections)


def _section(sections: list[CvSection], key: str) -> CvSection | None:
    return next((section for section in sections if section.key == key), None)


def _finding(category: str, severity: str, title: str, rationale: str, source_section: str | None, action: str) -> CvFinding:
    return CvFinding(id=f"finding_{uuid4().hex}", category=category, severity=severity, title=title, rationale=rationale, source_section=source_section, proposed_action=action)


def analyze_findings(sections: list[CvSection], target_role: str, source_type: str) -> tuple[int, list[CvFinding], list[CvRoleSkill]]:
    combined = _text(sections)
    lower = combined.lower()
    words = re.findall(r"\b[\w+#./-]+\b", combined, flags=re.UNICODE)
    word_count = len(words)
    findings: list[CvFinding] = []
    contact = _section(sections, "contact")
    contact_text = contact.content if contact else ""
    if not re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", contact_text, flags=re.I):
        findings.append(_finding("structure", "high", "Email address is not clearly detected", "A recruiter or ATS needs a reliable contact method. The parser could not identify an email address in the Contact section.", "contact", "Add or correct your email address in the reviewed Contact section."))
    for key, label, severity in (("education", "Education", "high"), ("skills", "Skills", "medium"), ("projects", "Projects", "medium")):
        if not _section(sections, key):
            findings.append(_finding("structure", severity, f"{label} section is not clearly detected", f"The reviewed CV does not currently contain a standard {label} section. Standard headings improve scanability and ATS parsing.", None, f"Add a standard {label} heading if you have relevant information to include."))
    if not _section(sections, "experience"):
        findings.append(_finding("experience", "low", "Experience section is not detected", "This is not automatically a problem for a student CV, but internships, volunteering or relevant work can be easier to find under a standard Experience heading.", None, "If you have relevant experience, add it using factual employer/role/date information only."))
    else:
        findings.append(_finding("experience", "low", "Experience evidence is reviewable", "An Experience section is present. LumaPath checks wording structure but does not infer employers, dates, responsibilities or achievements beyond the reviewed text.", "experience", "Verify employer/role/date details and add outcomes only when you can support them with evidence."))
    if _section(sections, "projects"):
        findings.append(_finding("projects", "low", "Project evidence is available", "A Projects section is present and can support role-skill evidence when the wording matches work you actually completed.", "projects", "Keep project descriptions factual and connect technologies or outcomes only to evidence you can verify."))
    if _section(sections, "skills"):
        findings.append(_finding("skills", "low", "Skills section is available for evidence checks", "A Skills section is present. Role matching uses it as traceability evidence, not as proof of proficiency by itself.", "skills", "Retain only skills you can support with coursework, projects, experience or another verifiable source."))
    if word_count < 180:
        findings.append(_finding("readability", "medium", "CV is very short", f"The reviewed content contains about {word_count} words. Important education, project or evidence details may be missing.", None, "Check whether role-relevant projects, skills and education details are missing before adding filler."))
    elif word_count > 1200:
        findings.append(_finding("readability", "medium", "CV is unusually long", f"The reviewed content contains about {word_count} words. Dense CVs can make relevant evidence harder to locate.", None, "Remove repetition and keep the most role-relevant, verifiable evidence."))
    sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", combined) if len(item.split()) >= 4]
    avg_sentence = (sum(len(item.split()) for item in sentences) / len(sentences)) if sentences else 0
    if avg_sentence > 28:
        findings.append(_finding("readability", "medium", "Sentences are difficult to scan", f"Sentences average about {avg_sentence:.0f} words in the extracted text.", None, "Shorten long sentences and prefer concise factual bullets where appropriate."))
    if re.search(r"\bi\s+(?:am|have|worked|did|created|developed)\b", combined, flags=re.I):
        findings.append(_finding("readability", "low", "First-person wording is present", "CV bullets are usually easier to scan when they begin directly with a factual action rather than repeated first-person phrasing.", None, "Review first-person sentences and convert only the wording—not the underlying claim—to concise CV-style phrasing."))
    grammar_signals: list[str] = []
    if re.search(r"\bi\b", combined):
        grammar_signals.append("lowercase first-person pronoun 'i'")
    if re.search(r"[!?]{2,}", combined):
        grammar_signals.append("repeated exclamation/question punctuation")
    common_typos = sorted(set(re.findall(r"\b(?:teh|recieve|seperate|experiance|responsibilites)\b", lower)))
    grammar_signals.extend(f"possible typo: {item}" for item in common_typos)
    if grammar_signals:
        findings.append(_finding("readability", "medium", "Possible grammar or typing issues need review", "Deterministic text checks found: " + "; ".join(grammar_signals[:5]) + ". This is a limited screening, not a full grammar authority.", None, "Proofread the flagged wording and preserve names, technical terms and factual meaning while correcting only clear language errors."))
    else:
        findings.append(_finding("readability", "low", "Basic grammar and readability screening completed", "No obvious typo/punctuation signal was detected by the deterministic screening rules. This does not replace a full human proofread.", None, "Proofread the final CV for names, tense consistency, technical terms and sentence clarity before using it."))
    if re.search(r"ignore (?:all |previous |the )?instructions|system prompt|developer message", lower):
        findings.append(_finding("privacy", "low", "Instruction-like text was treated as CV content", "The CV contains text that resembles an instruction to an AI system. LumaPath did not execute it; it remained untrusted document content.", None, "Remove this text if it is not genuinely part of the CV."))
    if source_type == "upload":
        findings.append(_finding("ats", "low", "Visual ATS formatting still needs a manual check", "Text extraction can test headings and content, but it cannot guarantee that columns, text boxes, graphics or reading order will be interpreted correctly by every ATS.", None, "Keep the exported CV simple and verify the final PDF/DOCX reading order before applying."))

    portfolio_lookup: dict[str, list[str]] = {}
    role_skill_rows: list[CvRoleSkill] = []
    for rule in role_skills(target_role):
        matches = sorted({keyword for keyword in rule.keywords if keyword.lower() in lower})
        status = "cv_evidenced" if matches else "not_demonstrated_in_cv"
        evidence = [f"CV text includes: {match}" for match in matches]
        role_skill_rows.append(CvRoleSkill(skill_id=rule.skill_id, skill_name=rule.name, status=status, evidence=evidence or ["No matching evidence is visible in the reviewed CV."]))
    demonstrated_count = sum(row.status == "cv_evidenced" for row in role_skill_rows)
    findings.append(_finding(
        "ats", "low" if demonstrated_count else "medium", "Target-role keyword evidence is traceable",
        f"The reviewed CV contains matching evidence for {demonstrated_count} of {len(role_skill_rows)} skill area(s) in the {target_role} taxonomy. Keyword presence is only a traceability aid, not an ATS score or recruiter-outcome prediction.",
        "skills" if _section(sections, "skills") else None,
        "Use role-relevant terms only where the CV can point to real coursework, project, experience or other evidence; do not keyword-stuff unsupported skills.",
    ))
    missing_count = sum(row.status == "not_demonstrated_in_cv" for row in role_skill_rows)
    if missing_count:
        findings.append(_finding("skills", "low", "Some target-role skills are not demonstrated in the CV", f"{missing_count} skill area(s) from the {target_role} role taxonomy have no matching evidence in the reviewed CV. This does not mean you lack those skills.", "skills" if _section(sections, "skills") else None, "Add a skill only when you can support it with coursework, a project, experience or another verifiable source."))
    if _section(sections, "projects") is None:
        findings.append(_finding("projects", "medium", "Project evidence is hard to find", "Projects are a useful way for a student to demonstrate role skills, but no standard Projects section was detected.", None, "Add selected projects only when you can describe what you actually built or contributed."))
    return word_count, findings, role_skill_rows
