import type { DemoState } from "@/data/demo/types";

export type MentorConsentCategory = "academic_summary" | "career_goal" | "career_readiness" | "roadmap";
export type MentorRelationshipStatus = "pending" | "active" | "revoked" | "expired";

export interface MentorRelationship {
  id: string;
  student_id: string;
  mentor_label: string;
  mentor_name: string | null;
  purpose: string;
  status: MentorRelationshipStatus;
  categories: MentorConsentCategory[];
  invite_expires_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SharedSummary {
  academic_summary: null | {
    university: string; degree: string; academic_year: string; semester: string; current_modules: string[];
    open_academic_tasks: number; completed_academic_tasks: number;
    upcoming_deadlines: { title: string; module: string | null; due_at: string }[];
  };
  career_goal: null | { target_role: string; career_goal: string; learning_goal: string | null };
  career_readiness: null | { score: number; weekly_delta: number; breakdown: { label: string; value: number }[] };
  roadmap: null | { pathway_id: string; version: number; target_role: string; goal: string; milestones: { skill_id: string; name: string; state: string; proficiency: number; transferable_credit: boolean }[]; updated_at: string };
}

export interface ConsentPreview { purpose: string; categories: MentorConsentCategory[]; shared: SharedSummary; never_shared_by_default: string[]; }
export interface GuidanceRequest { id: string; relationship_id: string; title: string; question: string; context_note: string; status: "open" | "answered" | "closed"; created_at: string; updated_at: string; }
export interface MentorRecommendation { id: string; relationship_id: string; guidance_request_id: string | null; kind: "comment" | "recommendation"; title: string; rationale: string; suggested_action: string; suggested_minutes: number | null; status: "proposed" | "accepted" | "dismissed" | "planned"; student_note: string; created_at: string; decided_at: string | null; planned_at: string | null; }
export interface MentorAccessAudit { id: number; actor_type: string; event_type: string; categories: string[]; detail: string; occurred_at: string; }
export interface MentorView { relationship: MentorRelationship; shared: SharedSummary; guidance_requests: GuidanceRequest[]; recommendations: MentorRecommendation[]; never_shared_by_default: string[]; }
export interface MentorPlanAction { recommendation_id: string; internal_task_id: string; title: string; start_at: string; end_at: string; planned_minutes: number; source_label: string; description: string; }

function moduleList(value: string) {
  return value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

export function buildMentorShareSnapshot(state: DemoState) {
  const academicTasks = state.tasks.filter((task) => task.category === "Academic");
  const upcoming = academicTasks
    .filter((task) => task.status !== "completed" && task.dueAt)
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))
    .slice(0, 20)
    .map((task) => ({ title: task.title, module: task.module ?? null, due_at: task.dueAt! }));
  return {
    academic_summary: {
      university: state.onboarding.university || state.student.university,
      degree: state.onboarding.degree,
      academic_year: state.onboarding.academicYear,
      semester: state.onboarding.semester,
      current_modules: moduleList(state.onboarding.currentModules),
      open_academic_tasks: academicTasks.filter((task) => task.status !== "completed").length,
      completed_academic_tasks: academicTasks.filter((task) => task.status === "completed").length,
      upcoming_deadlines: upcoming,
    },
    career_goal: {
      target_role: state.onboarding.careerGoal || state.student.targetRole,
      career_goal: state.onboarding.goal,
      learning_goal: state.learningGoal?.title ?? null,
    },
    career_readiness: {
      score: state.readiness.score,
      weekly_delta: state.readiness.weeklyDelta,
      breakdown: state.readiness.breakdown.map((item) => ({ label: item.label, value: item.value })),
    },
  };
}

export async function mentorStudentRequest<T>(path: string, studentId: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init, cache: "no-store",
    headers: { "X-Luma-Student-Id": studentId, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail ?? "Mentor support request failed.");
  return body as T;
}

export async function mentorAccessRequest<T>(path: string, accessToken?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init, cache: "no-store",
    headers: { ...(accessToken ? { "X-Luma-Mentor-Token": accessToken } : {}), ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail ?? "Mentor access request failed.");
  return body as T;
}
