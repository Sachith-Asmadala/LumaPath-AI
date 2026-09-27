export type TaskCategory = "Academic" | "Career" | "career-learning" | "Personal" | "Internship" | "AI Recommended";
export type TaskStatus = "upcoming" | "in-progress" | "completed" | "missed";
export type RiskLevel = "critical" | "high" | "moderate" | "low";
export type SkillStatus = "verified" | "completed" | "in-progress" | "available" | "locked" | "gap";
export type EvidenceStatus = "self-reported" | "submitted" | "verified" | "expired" | "needs-review";
export type IntelligenceStatus = "new" | "saved" | "dismissed" | "planned" | "not-relevant";
export type SimulationKind = "capacity" | "replan" | "recovery" | "generate" | "learning-path" | null;
export type CareerGoal = "DevOps Engineer" | "Backend Engineer" | "AI Engineer" | "Cloud Engineer" | "Cybersecurity Engineer";
export type LearningBudget = "free only" | "under $20/month" | "flexible";
export type LearningStyle = "video" | "hands-on" | "reading" | "projects";
export type StudentGoal = "internship" | "entry-level job" | "certification";
export type LifeLoadFactor = "Academic pressure" | "Family responsibilities" | "Relationship pressure" | "Financial pressure" | "Work / internship" | "Health / low energy" | "Social commitments" | "Other";
export type LifeLoadImpact = "Low" | "Medium" | "High";

export interface OnboardingState {
  completed: boolean;
  name: string;
  university: string;
  degree: string;
  academicYear: string;
  semester: string;
  currentModules: string;
  careerGoal: CareerGoal;
  weeklyLearningHours: number;
  budget: LearningBudget;
  preferredLearning: LearningStyle[];
  language: string;
  goal: StudentGoal;
}

export type BaselineSkill = "Linux" | "Git" | "Networking" | "Docker" | "CI/CD" | "Cloud";

export interface BaselineAssessmentResult {
  answers: Record<string, string>;
  overallScore: number;
  skillScores: Record<BaselineSkill, number>;
  correctCount: number;
  totalQuestions: number;
}

export type SkillGapLevel = "strong" | "improve" | "gap";

export interface SkillGapData {
  levels: Record<BaselineSkill, SkillGapLevel>;
  strong: BaselineSkill[];
  improve: BaselineSkill[];
  gap: BaselineSkill[];
  recommendedSkill: BaselineSkill | null;
  prerequisiteSkills: BaselineSkill[];
  unlocks: BaselineSkill[];
}

export interface StudentProfile {
  id: string;
  name: string;
  targetRole: string;
  university: string;
  initials: string;
}

export interface StudentCapacity {
  availableMinutes: number;
  energy: 1 | 2 | 3 | 4 | 5;
  focus: "low" | "medium" | "high";
  workload: "light" | "moderate" | "heavy";
  unexpectedCommitmentMinutes: number;
  lifeLoadFactors?: Partial<Record<LifeLoadFactor, LifeLoadImpact>>;
  lifeLoadNote?: string;
}

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  estimatedMinutes: number;
  dueAt?: string;
  progress: number;
  difficulty: number;
  careerSkillIds: string[];
  skill?: string;
  riskScore: number;
  careerRelevance: number;
  description: string;
}

export interface PlanBlock {
  id: string;
  taskId: string | null;
  title: string;
  category: TaskCategory;
  startAt: string;
  endAt: string;
  previousStartAt?: string;
  lifeLoadOriginalMinutes?: number;
  isFixed?: boolean;
  isFocusBlock?: boolean;
  isConflict?: boolean;
  isMissed?: boolean;
}

export interface PriorityReason {
  label: string;
  points: number;
}

export interface NextBestAction {
  taskId: string;
  title: string;
  durationMinutes: number;
  score: number;
  deadlineRisk: RiskLevel;
  careerImpact: "High" | "Moderate" | "Low";
  energyFit: "Good" | "Fair" | "Rest first";
  rationale: string;
  metrics: {
    urgency: number;
    academicImpact: number;
    careerRelevance: number;
    capacityFit: number;
  };
  reasons: PriorityReason[];
}

export interface CareerSkill {
  id: string;
  name: string;
  status: SkillStatus;
  proficiency: number;
  targetScore?: number;
  estimatedWeeks?: number;
  prerequisites: string[];
  description: string;
}

export interface SkillEvidence {
  id: string;
  skillId: string;
  source: string;
  label: string;
  status: EvidenceStatus;
  confidence: number;
  verifiedAt?: string;
}

export interface ReadinessMetric {
  id: "technical" | "evidence" | "certifications" | "interview" | "applications";
  label: string;
  value: number;
  weight: number;
}

export interface CareerReadiness {
  score: number;
  weeklyDelta: number;
  breakdown: ReadinessMetric[];
}

export interface IntelligenceItem {
  id: string;
  kind: "Learning article" | "Industry news" | "Security advisory" | "Tool release" | "Certification update" | "Internship" | "Hackathon" | "Scholarship" | "Workshop";
  title: string;
  source: string;
  publishedAt: string;
  whyRelevant: string;
  durationMinutes: number;
  status: IntelligenceStatus;
}

export interface Opportunity {
  id: string;
  role: string;
  organization: string;
  match: number;
  strengths: string[];
  missingSkills: string[];
  closesAt: string;
  recommendation: string;
}

export interface Notification {
  id: string;
  kind: "risk" | "plan" | "career" | "evidence" | "opportunity" | "intelligence" | "focus";
  title: string;
  description: string;
  href: string;
  createdAt: string;
  read: boolean;
}

export interface DemoSimulation {
  kind: SimulationKind;
  step: string | null;
  message: string | null;
  result: string[];
  announcement: string;
}

export interface DemoState {
  student: StudentProfile;
  onboarding: OnboardingState;
  assessment: BaselineAssessmentResult | null;
  skillGap: SkillGapData | null;
  selectedResourceBySkill: Record<string, string>;
  selectedFreePathBySkill: Record<string, string>;
  scheduledFreePathBySkill: Record<string, string>;
  capacity: StudentCapacity;
  tasks: Task[];
  planBlocks: PlanBlock[];
  activeAction: NextBestAction;
  careerSkills: CareerSkill[];
  evidence: SkillEvidence[];
  readiness: CareerReadiness;
  intelligenceItems: IntelligenceItem[];
  opportunities: Opportunity[];
  notifications: Notification[];
  simulation: DemoSimulation;
  completedTaskCount: number;
  productiveMinutes: number;
  currentStreak: number;
}

export interface NewTaskInput {
  title: string;
  category: TaskCategory;
  estimatedMinutes: number;
  dueAt?: string;
  startAt: string;
  description?: string;
}
