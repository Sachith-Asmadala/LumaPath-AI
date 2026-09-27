import { scenarioAt, scenarioDate } from "./scenario";
import type { CareerReadiness, CareerSkill, DemoState, IntelligenceItem, Notification, OnboardingState, Opportunity, PlanBlock, SkillEvidence, StudentCapacity, Task } from "./types";

const monday = scenarioDate(0);
const at = (day: string, time: string) => `${day}T${time}:00`;

export const demoStudent = {
  id: "student-sachith",
  name: "Sachith",
  targetRole: "DevOps Engineer",
  university: "Pacific Northwest University",
  initials: "S",
};

export const defaultOnboarding: OnboardingState = {
  completed: false,
  name: "",
  university: "",
  degree: "",
  academicYear: "",
  semester: "",
  currentModules: "",
  careerGoal: "DevOps Engineer",
  weeklyLearningHours: 6,
  budget: "free only",
  preferredLearning: [],
  language: "English",
  goal: "internship",
};

export const defaultCapacity: StudentCapacity = {
  availableMinutes: 270,
  energy: 4,
  focus: "high",
  workload: "moderate",
  unexpectedCommitmentMinutes: 0,
};

export const demoTasks: Task[] = [
  {
    id: "database-assignment",
    title: "Database Assignment",
    category: "Academic",
    status: "in-progress",
    estimatedMinutes: 120,
    dueAt: at(scenarioDate(2), "23:59"),
    progress: 58,
    difficulty: 4,
    careerSkillIds: ["sql", "cloud"],
    riskScore: 86,
    careerRelevance: 61,
    description: "Finish the query plan and document the indexing trade-offs.",
  },
  {
    id: "docker-lab",
    title: "Docker Networking Lab",
    category: "Career",
    status: "in-progress",
    estimatedMinutes: 75,
    dueAt: at(scenarioDate(4), "17:00"),
    progress: 61,
    difficulty: 3,
    careerSkillIds: ["docker"],
    riskScore: 44,
    careerRelevance: 91,
    description: "Connect the app and database containers on a custom bridge network.",
  },
  {
    id: "se-presentation",
    title: "SE Presentation",
    category: "Academic",
    status: "upcoming",
    estimatedMinutes: 90,
    dueAt: at(scenarioDate(2), "17:00"),
    progress: 44,
    difficulty: 3,
    careerSkillIds: ["interview"],
    riskScore: 44,
    careerRelevance: 54,
    description: "Rehearse the architecture walkthrough and tighten the final slide.",
  },
  {
    id: "aws-fundamentals",
    title: "AWS Fundamentals",
    category: "Career",
    status: "upcoming",
    estimatedMinutes: 60,
    dueAt: at(scenarioDate(3), "21:00"),
    progress: 36,
    difficulty: 2,
    careerSkillIds: ["cloud"],
    riskScore: 31,
    careerRelevance: 83,
    description: "Review IAM policies and complete the shared-responsibility module.",
  },
  {
    id: "portfolio-readme",
    title: "Portfolio README Improvement",
    category: "Career",
    status: "upcoming",
    estimatedMinutes: 45,
    dueAt: at(scenarioDate(6), "20:00"),
    progress: 72,
    difficulty: 2,
    careerSkillIds: ["docker", "git"],
    riskScore: 22,
    careerRelevance: 74,
    description: "Add a concise system diagram and reproducible setup steps.",
  },
  {
    id: "cloud-architecture-lab",
    title: "Cloud Architecture Lab",
    category: "Academic",
    status: "upcoming",
    estimatedMinutes: 90,
    dueAt: at(scenarioDate(3), "16:00"),
    progress: 47,
    difficulty: 4,
    careerSkillIds: ["cloud", "terraform"],
    riskScore: 68,
    careerRelevance: 79,
    description: "Map the deployment topology and verify network boundaries.",
  },
  {
    id: "docker-certification",
    title: "Docker Certification",
    category: "Career",
    status: "upcoming",
    estimatedMinutes: 55,
    dueAt: at(scenarioDate(6), "18:00"),
    progress: 19,
    difficulty: 2,
    careerSkillIds: ["docker"],
    riskScore: 19,
    careerRelevance: 70,
    description: "Review image lifecycle, storage, and container networking.",
  },
];

export const demoPlanBlocks: PlanBlock[] = [
  { id: "lecture-monday", taskId: null, title: "Systems Lecture", category: "Academic", startAt: at(monday, "09:00"), endAt: at(monday, "10:30"), isFixed: true },
  { id: "block-docker", taskId: "docker-lab", title: "Docker Networking Lab", category: "Career", startAt: at(monday, "11:30"), endAt: at(monday, "12:45") },
  { id: "block-database", taskId: "database-assignment", title: "Database Assignment", category: "Academic", startAt: at(monday, "14:00"), endAt: at(monday, "15:30") },
  { id: "block-aws", taskId: "aws-fundamentals", title: "AWS Fundamentals", category: "Career", startAt: at(monday, "18:00"), endAt: at(monday, "19:00") },
  { id: "block-review", taskId: "se-presentation", title: "Revision block", category: "Academic", startAt: at(monday, "20:30"), endAt: at(monday, "21:15") },
];

export const demoCareerSkills: CareerSkill[] = [
  { id: "linux", name: "Linux & Networking", status: "verified", proficiency: 90, prerequisites: [], description: "System fundamentals, shell fluency, and core network concepts." },
  { id: "git", name: "Git & Scripting", status: "verified", proficiency: 82, prerequisites: ["linux"], description: "Version control workflows and practical automation." },
  { id: "docker", name: "Docker", status: "in-progress", proficiency: 68, prerequisites: ["git"], description: "Build, network, and ship reliable containerized services." },
  { id: "cicd", name: "CI/CD", status: "locked", proficiency: 42, prerequisites: ["docker"], description: "Automate test, integration, and deployment workflows." },
  { id: "cloud", name: "Cloud", status: "available", proficiency: 53, prerequisites: ["git"], description: "Understand cloud services, identity, and resilient architecture." },
  { id: "terraform", name: "Terraform", status: "locked", proficiency: 24, prerequisites: ["docker", "cloud"], description: "Provision infrastructure with versioned, repeatable configuration." },
  { id: "kubernetes", name: "Kubernetes", status: "locked", proficiency: 18, prerequisites: ["cicd", "terraform"], description: "Orchestrate container workloads and manage cluster operations." },
  { id: "monitoring", name: "Monitoring", status: "locked", proficiency: 12, prerequisites: ["cloud", "cicd"], description: "Measure service health and respond to operational signals." },
];

export const demoEvidence: SkillEvidence[] = [
  { id: "docker-repo", skillId: "docker", source: "GitHub Repository", label: "containerized-api", status: "verified", confidence: 94, verifiedAt: scenarioDate(-5) },
  { id: "docker-cert", skillId: "docker", source: "Certificate", label: "Docker Essentials Certificate", status: "verified", confidence: 88, verifiedAt: scenarioDate(-14) },
  { id: "docker-assessment", skillId: "docker", source: "LumaPath Assessment", label: "Networking assessment · 86%", status: "submitted", confidence: 86 },
  { id: "docker-mentor", skillId: "docker", source: "Mentor Validation", label: "Networking lab review", status: "needs-review", confidence: 80 },
  { id: "linux-repo", skillId: "linux", source: "GitHub Repository", label: "server-health-check", status: "verified", confidence: 91, verifiedAt: scenarioDate(-29) },
  { id: "git-portfolio", skillId: "git", source: "Portfolio Project", label: "Release automation scripts", status: "verified", confidence: 89, verifiedAt: scenarioDate(-31) },
  { id: "cloud-course", skillId: "cloud", source: "Coursework", label: "Cloud Foundations module", status: "self-reported", confidence: 58 },
];

export const demoReadiness: CareerReadiness = {
  score: 72,
  weeklyDelta: 4,
  breakdown: [
    { id: "technical", label: "Technical skills", value: 78, weight: 0.3 },
    { id: "evidence", label: "Portfolio evidence", value: 64, weight: 0.25 },
    { id: "certifications", label: "Certifications", value: 82, weight: 0.15 },
    { id: "interview", label: "Interview readiness", value: 58, weight: 0.15 },
    { id: "applications", label: "Applications", value: 70, weight: 0.15 },
  ],
};

export const demoIntelligenceItems: IntelligenceItem[] = [
  { id: "kubernetes-fundamentals", kind: "Learning article", title: "Complete Kubernetes Fundamentals", source: "LumaPath Learning Path", publishedAt: scenarioDate(-2), whyRelevant: "Kubernetes is your biggest skill opportunity. This guided path builds the foundations you need before taking on cluster operations.", durationMinutes: 50, status: "new" },
  { id: "kube-health-checks", kind: "Learning article", title: "Designing health checks that tell you something useful", source: "Platform Notes", publishedAt: scenarioDate(-3), whyRelevant: "Kubernetes is your next pathway milestone, so this gives you a concrete operational pattern to recognize as you study.", durationMinutes: 22, status: "new" },
  { id: "aws-iam-advisory", kind: "Security advisory", title: "A practical guide to safer IAM role boundaries", source: "Cloud Security Brief", publishedAt: scenarioDate(-4), whyRelevant: "AWS Fundamentals is on your plan this week; this connects IAM policy review to real deployment decisions.", durationMinutes: 30, status: "new" },
  { id: "devops-internship", kind: "Internship", title: "DevOps Intern · ABC Technologies", source: "Career Intelligence", publishedAt: scenarioDate(-4), whyRelevant: "This role values Docker and Git evidence you already have, and highlights AWS as your clearest application gap.", durationMinutes: 40, status: "new" },
  { id: "container-release", kind: "Tool release", title: "Container build caching patterns for faster CI", source: "Engineering Weekly", publishedAt: scenarioDate(-6), whyRelevant: "Your next pathway work is CI/CD, so this release shows where build speed and reproducibility meet.", durationMinutes: 25, status: "new" },
];

export const demoOpportunities: Opportunity[] = [
  { id: "abc-devops-intern", role: "DevOps Intern", organization: "ABC Technologies", match: 82, strengths: ["Linux", "Git", "Docker"], missingSkills: ["AWS", "Kubernetes"], closesAt: scenarioDate(6), recommendation: "You're almost ready. Complete AWS Fundamentals and improve your Docker project README before applying." },
];

export const demoNotifications: Notification[] = [
  { id: "notify-deadline-risk", kind: "risk", title: "Database Assignment is at high risk", description: "There is still implementation work to complete before Wednesday.", href: "/planner", createdAt: scenarioAt(-2, "08:10:00"), read: false },
  { id: "notify-career-step", kind: "career", title: "Docker is your current pathway step", description: "Two prerequisites are ready when your lab is complete.", href: "/career-path", createdAt: scenarioAt(-2, "08:05:00"), read: false },
  { id: "notify-intel", kind: "intelligence", title: "A learning resource matches your next milestone", description: "The latest Kubernetes guide fits your DevOps pathway.", href: "/intelligence", createdAt: scenarioAt(-3, "18:00:00"), read: true },
];

export function createDemoState(): DemoState {
  return {
    student: { ...demoStudent },
    onboarding: { ...defaultOnboarding, preferredLearning: [] },
    assessment: null,
    skillGap: null,
    selectedResourceBySkill: {},
    selectedFreePathBySkill: {},
    scheduledFreePathBySkill: {},
    capacity: { ...defaultCapacity },
    tasks: demoTasks.map((task) => ({ ...task, careerSkillIds: [...task.careerSkillIds] })),
    planBlocks: demoPlanBlocks.map((block) => ({ ...block })),
    activeAction: {
      taskId: "docker-lab",
      title: "Complete Docker Networking Lab",
      durationMinutes: 75,
      score: 86,
      deadlineRisk: "moderate",
      careerImpact: "High",
      energyFit: "Good",
      rationale: "Completing this task unlocks your next CI/CD pathway milestone and fits your current 90-minute focus window.",
      metrics: { urgency: 76, academicImpact: 68, careerRelevance: 91, capacityFit: 84 },
      reasons: [
        { label: "Deadline urgency", points: 28 },
        { label: "Career relevance", points: 24 },
        { label: "Prerequisite importance", points: 19 },
        { label: "Academic impact", points: 12 },
        { label: "Available capacity", points: 10 },
        { label: "Effort penalty", points: -7 },
      ],
    },
    careerSkills: demoCareerSkills.map((skill) => ({ ...skill, prerequisites: [...skill.prerequisites] })),
    evidence: demoEvidence.map((item) => ({ ...item })),
    readiness: { ...demoReadiness, breakdown: demoReadiness.breakdown.map((item) => ({ ...item })) },
    intelligenceItems: demoIntelligenceItems.map((item) => ({ ...item })),
    opportunities: demoOpportunities.map((item) => ({ ...item, strengths: [...item.strengths], missingSkills: [...item.missingSkills] })),
    notifications: demoNotifications.map((item) => ({ ...item })),
    simulation: { kind: null, step: null, message: null, result: [], announcement: "" },
    completedTaskCount: 0,
    productiveMinutes: 0,
    currentStreak: 0,
  };
}
