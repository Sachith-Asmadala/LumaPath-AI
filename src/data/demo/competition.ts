import scenario from "./competition-scenario.json";
import { createDemoState } from "./seed";
import type { DemoState, Notification, PlanBlock, Task } from "./types";
import type { OpportunityItem } from "@/features/opportunities/domain/opportunities";
import { buildNextBestAction } from "@/features/planner/domain/priority";
import { measuredReadiness } from "@/features/career/domain/readiness";
const endAtMinutes = (startAt: string, minutes: number) => new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString();

export type CompetitionSnapshot = { version: string; student_id: string; scenario_date: string; synthetic: boolean; opportunity: OpportunityItem; plan: string; comparison_roles: import("@/features/career-scenarios/domain/career-scenarios").CareerScenarioRole[] };
export const competitionScenario = scenario;
export function createCompetitionState(snapshot: CompetitionSnapshot): DemoState {
  if (snapshot.version !== scenario.version || snapshot.student_id !== scenario.student.id || snapshot.opportunity?.id !== scenario.opportunityId) throw new Error("The competition scenario could not be verified. Please reset again.");
  const state = createDemoState();
  state.student = { ...scenario.student };
  state.onboarding = { ...state.onboarding, completed: true, name: scenario.student.name, university: scenario.student.university, degree: "Computer Science", academicYear: "Year 3", semester: "Semester 1", currentModules: "Software Engineering, Statistics, Computer Graphics", preferredLearning: ["hands-on"], language: "English", careerGoal: "DevOps Engineer" };
  state.competition = { version: scenario.version, date: scenario.date, opportunity: snapshot.opportunity, roles: snapshot.comparison_roles, deadlineChanged: false };
  state.tasks = structuredClone(scenario.tasks) as Task[];
  state.planBlocks = structuredClone(scenario.blocks) as PlanBlock[];
  state.capacity = { availableMinutes: scenario.capacityMinutes, energy: 2, focus: "medium", workload: "heavy", unexpectedCommitmentMinutes: 0 };
  state.careerSkills = state.careerSkills.map(skill => {
    const configured = scenario.skills.find(item => item.id === skill.id);
    return configured ? { ...skill, name: configured.name, status: configured.status as typeof skill.status, proficiency: configured.proficiency } : { ...skill, proficiency: 0, status: "locked" };
  });
  state.evidence = scenario.skills.map(skill => ({ id: `competition-evidence-${skill.id}`, skillId: skill.id, source: skill.id === "git" ? "GitHub project" : "Baseline assessment", label: skill.title, status: skill.verification === "verified" ? "verified" : "self-reported", confidence: skill.verification === "verified" ? 90 : 65, ...(skill.id === "git" ? { kind: "project" as const, url: "https://example.org/lumapath-competition/git-project" } : {}) }));
  state.activeAction = buildNextBestAction(state.tasks[0], { durationMinutes: 60, rationale: "The assignment is due soon and still needs integration tests. A 60-minute block fits today's limited capacity; Docker practice can follow once this academic deadline is protected." });
  state.readiness = measuredReadiness(state);
  state.intelligenceItems = scenario.intelligence.map(item => ({ id: `competition-${item.id}`, kind: "Learning article", title: item.title, source: "Luma Learning Library (demo)", publishedAt: item.publishedAt, whyRelevant: item.excerpt, durationMinutes: item.readingMinutes, status: "new" }));
  state.opportunities = [{ id: snapshot.opportunity.id, role: snapshot.opportunity.title, organization: snapshot.opportunity.provider, match: snapshot.opportunity.rank_score ?? 0, strengths: [...snapshot.opportunity.strengths], missingSkills: [...snapshot.opportunity.skill_gaps], closesAt: snapshot.opportunity.closes_on ?? "", recommendation: snapshot.opportunity.why_fit ?? snapshot.opportunity.summary }];
  state.notifications = structuredClone(scenario.notifications) as Notification[];
  state.completedTaskCount = 0;
  state.productiveMinutes = 0;
  state.currentStreak = 0;
  return state;
}

/** Apply the disruption to existing task/block contracts, without creating work. */
export function adaptCompetitionDeadline(state: DemoState): DemoState {
  if (!state.competition || state.competition.deadlineChanged) return state;
  const assignment = state.tasks.find(task => task.id === "se-assignment");
  const assignmentBlock = state.planBlocks.find(block => block.taskId === assignment?.id);
  const practiceBlock = state.planBlocks.find(block => block.taskId === "docker-practice");
  if (!assignment || !assignmentBlock || !practiceBlock) throw new Error("The competition plan needs a reset before adapting.");
  const startAt = `${state.competition.date}${assignmentBlock.startAt.slice(10)}`;
  const dockerStart = assignmentBlock.startAt;
  const changedTask = { ...assignment, dueAt: `${state.competition.date}T23:59:00+05:30`, riskScore: 95 };
  return { ...state, competition: { ...state.competition, deadlineChanged: true }, tasks: state.tasks.map(task => task.id === assignment.id ? changedTask : task),
    planBlocks: state.planBlocks.map(block => block.id === assignmentBlock.id ? { ...block, previousStartAt: block.startAt, startAt, endAt: endAtMinutes(startAt, assignment.estimatedMinutes), adaptationReason: "Deadline moved earlier; protect today's submission." } : block.id === practiceBlock.id ? { ...block, previousStartAt: block.startAt, startAt: dockerStart, endAt: endAtMinutes(dockerStart, 45), adaptationReason: "Lower immediate urgency; keeps time for the assignment and quiz." } : block),
    activeAction: buildNextBestAction(changedTask, { durationMinutes: Math.min(60,state.capacity.availableMinutes), rationale: "The assignment deadline moved from Oct 7 to Oct 5. Its existing work block now comes first; Docker practice moves to Oct 7 and today's quiz block stays protected." }),
    simulation: { kind: null, step: null, message: "Deadline plan adapted", result: ["Assignment deadline protected", "Docker practice moved", "Quiz block preserved"], announcement: "Plan adapted. Software Engineering Assignment moved to Oct 5; Docker Practice moved to Oct 7." },
  };
}

export function competitionPriorityFactors(state: DemoState) {
  const task = state.tasks.find(item => item.id === state.activeAction.taskId);
  if (!task) return [];
  const dependent = state.careerSkills.filter(skill => skill.prerequisites.some(id => task.careerSkillIds.includes(id)));
  return [
    { label: "Deadline urgency", detail: `${task.dueAt ? new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Colombo" }) : "No deadline"} submission · ${task.progress}% of work complete` },
    { label: "Academic impact", detail: task.category === "Academic" ? "Protects a current university module's assignment." : "Supports the selected career pathway." },
    { label: "Dependency impact", detail: dependent.length ? `${dependent.length} pathway milestones build on ${task.careerSkillIds.join(" / ")} foundations.` : "No additional pathway prerequisites recorded." },
    { label: "Career relevance", detail: `${task.careerSkillIds.join(" / ")} connects this work to ${state.student.targetRole}.` },
    { label: "Capacity fit", detail: `${task.estimatedMinutes} minutes of work within ${state.capacity.availableMinutes} available minutes today.` },
  ];
}
