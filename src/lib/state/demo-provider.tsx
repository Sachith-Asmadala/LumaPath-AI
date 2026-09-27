"use client";

import { scenarioAt, scenarioDate } from "../demo-data/scenario";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { demoDataAdapter } from "../demo-data/adapter";
import { canCompleteOnboarding, onboardingStorageKey, readCompletedOnboarding, studentFromOnboarding } from "../demo-data/onboarding";
import { baselineStorageKey, readBaselineAssessment, scoreBaselineAssessment } from "../domain/baseline-assessment";
import { generateSkillGap } from "../domain/skill-gap";
import { buildDevOpsRoadmap } from "../domain/personalized-roadmap";
import { recommendLearningResources } from "../domain/resource-recommender";
import { freePathForSkill } from "../demo-data/free-learning-paths";
import { hasLifeLoadFactors } from "../domain/life-load";
import { scheduleLearningPath } from "../domain/learning-path-scheduler";
import { buildNextBestAction, riskLevel } from "../domain/priority";
import { blocksAfterUrgentDeadline, endAtMinutes } from "../domain/planner";
import { raiseReadiness } from "../domain/readiness";
import type { BaselineAssessmentResult, CareerSkill, DemoSimulation, DemoState, IntelligenceItem, NewTaskInput, OnboardingState, PlanBlock, StudentCapacity, Task, TaskCategory } from "../demo-data/types";

import { adaptCapacityStage, capacityStages, isLowCapacity, recoverDatabase } from "../domain/dashboard";

type SimulationPatch = Partial<DemoSimulation>;
type DemoAction =
  | { type: "update-onboarding"; patch: Partial<OnboardingState> }
  | { type: "complete-onboarding" }
  | { type: "hydrate-onboarding"; onboarding: OnboardingState }
  | { type: "set-assessment"; result: BaselineAssessmentResult }
  | { type: "choose-resource"; skillId: string; resourceId: string }
  | { type: "add-free-path"; skillId: string; pathId: string }
  | { type: "schedule-free-path"; skillId: string; pathId: string }
  | { type: "capacity-stage"; capacity: StudentCapacity; stage: number }
  | { type: "recover-database" }
  | { type: "reset" }
  | { type: "patch"; patch: Partial<DemoState> }
  | { type: "simulation"; patch: SimulationPatch }
  | { type: "update-block"; block: PlanBlock }
  | { type: "update-task"; task: NewTaskInput & { id: string } }
  | { type: "miss-task"; taskId: string }
  | { type: "complete-task"; taskId: string }
  | { type: "complete-focus-session"; taskId: string; minutes: number }
  | { type: "complete-skill"; skillId: string; stage?: "verify" | "unlock" | "finish" }
  | { type: "verify-evidence"; evidenceId: string }
  | { type: "plan-intelligence"; itemId: string }
  | { type: "add-opportunity-preparation" }
  | { type: "select-action"; taskId: string }
  | { type: "mark-notification-read"; notificationId: string };

function unlockDownstream(skills: CareerSkill[], completedId: string): CareerSkill[] {
  const updated = skills.map((skill) =>
    skill.id === completedId ? { ...skill, status: "verified" as const, proficiency: 100 } : { ...skill },
  );
  for (const skill of updated) {
    if (skill.status !== "locked" || !skill.prerequisites.includes(completedId)) continue;
    const prerequisitesMet = skill.prerequisites.every((id) => {
      const status = updated.find((item) => item.id === id)?.status;
      return status === "verified" || status === "completed";
    });
    if (prerequisitesMet) {
      skill.status = "available";
    }
  }
  // Introductory Terraform work opens with verified Docker and available Cloud foundations.
  if (completedId === "docker" && !skills.some((skill) => skill.id === "networking")) {
    const terraform = updated.find((skill) => skill.id === "terraform");
    if (terraform?.status === "locked" && terraform.prerequisites.every((id) => updated.some((skill) => skill.id === id && ["verified", "available"].includes(skill.status)))) terraform.status = "available";
  }
  return updated;
}


function makeNotification(state: DemoState, notification: Omit<DemoState["notifications"][number], "id" | "createdAt" | "read">): DemoState["notifications"] {
  return [
    { id: `demo-notice-${state.notifications.length + 1}`, createdAt: scenarioAt(0, "08:00:00"), read: false, ...notification },
    ...state.notifications,
  ];
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "update-onboarding":
      return { ...state, onboarding: { ...state.onboarding, ...action.patch, completed: false } };
    case "complete-onboarding":
      if (!canCompleteOnboarding(state.onboarding)) return state;
      return { ...state, student: studentFromOnboarding(state.student, state.onboarding), onboarding: { ...state.onboarding, completed: true } };
    case "hydrate-onboarding":
      return { ...state, student: studentFromOnboarding(state.student, action.onboarding), onboarding: action.onboarding };
    case "set-assessment": {
      const skillGap = generateSkillGap(action.result);
      return {
        ...state,
        assessment: action.result,
        skillGap,
        selectedResourceBySkill: {},
        selectedFreePathBySkill: {},
        careerSkills: state.onboarding.careerGoal === "DevOps Engineer"
          ? buildDevOpsRoadmap(action.result, state.assessment ? state.careerSkills : [], state.onboarding.weeklyLearningHours, skillGap.recommendedSkill)
          : state.careerSkills,
      };
    }
    case "choose-resource": {
      if (!state.onboarding.completed || !state.assessment) return state;
      const skill = state.careerSkills.find((item) => item.id === action.skillId);
      if (!skill || (skill.status !== "available" && skill.status !== "in-progress")) return state;
      if (!recommendLearningResources(skill, state.onboarding).some((item) => item.resource.id === action.resourceId)) return state;
      return {
        ...state,
        selectedResourceBySkill: { ...state.selectedResourceBySkill, [skill.id]: action.resourceId },
        selectedFreePathBySkill: Object.fromEntries(Object.entries(state.selectedFreePathBySkill).filter(([id]) => id !== skill.id)),
        careerSkills: state.careerSkills.map((item) => item.id === skill.id && item.status === "available" ? { ...item, status: "in-progress" as const } : item),
      };
    }
    case "add-free-path": {
      if (!state.onboarding.completed || !state.assessment) return state;
      const skill = state.careerSkills.find((item) => item.id === action.skillId);
      const path = freePathForSkill(action.skillId);
      if (!skill || (skill.status !== "available" && skill.status !== "in-progress") || path?.id !== action.pathId) return state;
      return {
        ...state,
        selectedFreePathBySkill: { ...state.selectedFreePathBySkill, [skill.id]: path.id },
        selectedResourceBySkill: Object.fromEntries(Object.entries(state.selectedResourceBySkill).filter(([id]) => id !== skill.id)),
        careerSkills: state.careerSkills.map((item) => item.id === skill.id && item.status === "available" ? { ...item, status: "in-progress" as const } : item),
      };
    }
    case "schedule-free-path": {
      if (state.selectedFreePathBySkill[action.skillId] !== action.pathId || state.scheduledFreePathBySkill[action.skillId] === action.pathId) return state;
      const path = freePathForSkill(action.skillId);
      if (!path || path.id !== action.pathId) return state;
      const schedule = scheduleLearningPath(state, path);
      if (!schedule) return state;
      return {
        ...state,
        tasks: [...state.tasks, ...schedule.tasks],
        planBlocks: [...state.planBlocks, ...schedule.blocks],
        scheduledFreePathBySkill: { ...state.scheduledFreePathBySkill, [action.skillId]: action.pathId },
      };
    }
    case "capacity-stage":
      return adaptCapacityStage(state, action.capacity, action.stage);
    case "recover-database":
      return recoverDatabase(state);
    case "reset": {
      const fresh = demoDataAdapter.reset();
      return { ...fresh, student: state.student, onboarding: state.onboarding, assessment: state.assessment, skillGap: state.skillGap,
        careerSkills: state.assessment && state.onboarding.careerGoal === "DevOps Engineer"
          ? buildDevOpsRoadmap(state.assessment, [], state.onboarding.weeklyLearningHours, state.skillGap?.recommendedSkill ?? null)
          : fresh.careerSkills };
    }
    case "patch":
      return { ...state, ...action.patch };
    case "simulation":
      return { ...state, simulation: { ...state.simulation, ...action.patch } };
    case "update-block":
      return {
        ...state,
        planBlocks: state.planBlocks.map((block) => block.id === action.block.id ? { ...action.block, lifeLoadOriginalMinutes: undefined, isConflict: false } : block),
      };
    case "update-task": {
      const task = state.tasks.find((item) => item.id === action.task.id);
      if (!task) return state;
      const tasks = state.tasks.map((item) => item.id === action.task.id ? { ...item, title: action.task.title, category: action.task.category, estimatedMinutes: action.task.estimatedMinutes, dueAt: action.task.dueAt, description: action.task.description ?? item.description } : item);
      const planBlocks = state.planBlocks.map((block) => block.taskId === action.task.id ? { ...block, title: action.task.title, category: action.task.category, startAt: action.task.startAt, endAt: endAtMinutes(action.task.startAt, action.task.estimatedMinutes) } : block);
      return { ...state, tasks, planBlocks, simulation: { ...state.simulation, announcement: `${action.task.title} updated in your plan.` } };
    }
    case "miss-task": {
      const task = state.tasks.find((item) => item.id === action.taskId);
      if (!task) return state;
      return {
        ...state,
        tasks: state.tasks.map((item) => item.id === action.taskId ? { ...item, status: "missed" as const, riskScore: Math.max(item.riskScore, 94) } : item),
        planBlocks: state.planBlocks.map((block) => block.taskId === action.taskId ? { ...block, isMissed: true, title: `Missed · ${block.title}` } : block),
        activeAction: buildNextBestAction({ ...task, status: "missed", riskScore: Math.max(task.riskScore, 94) }, { title: `Recover ${task.title}`, score: 90, rationale: `This item was missed. A smaller recovery block can bring it back into the plan.` }),
        simulation: { ...state.simulation, announcement: `${task.title} marked as missed. Its deadline risk is now elevated.` },
      };
    }
    case "complete-focus-session": {
      const task = state.tasks.find((item) => item.id === action.taskId);
      if (!task || task.status === "completed") return state;
      const addedProgress = task.id === "docker-lab"
        ? 25
        : Math.max(8, Math.min(24, Math.round(action.minutes / task.estimatedMinutes * 25)));
      const progress = Math.min(100, task.progress + addedProgress);
      const hasFinishedTask = progress >= 100;
      const tasks = state.tasks.map((item) => item.id === action.taskId
        ? { ...item, progress, status: hasFinishedTask ? "completed" as const : item.status, riskScore: hasFinishedTask ? 0 : Math.max(0, item.riskScore - 12) }
        : item);
      const readiness = task.category === "Career" ? raiseReadiness(state.readiness, "technical", 2) : state.readiness;
      const careerSkills = task.id === "docker-lab" && hasFinishedTask
        ? unlockDownstream(state.careerSkills, "docker")
        : task.id === "docker-lab"
        ? state.careerSkills.map((skill) => skill.id === "docker" ? { ...skill, proficiency: Math.min(100, skill.proficiency + addedProgress) } : skill)
        : state.careerSkills;
      const nextTask = hasFinishedTask ? tasks.find((item) => item.status !== "completed") ?? task : task;
      const result: DemoState = {
        ...state,
        tasks,
        careerSkills,
        readiness,
        productiveMinutes: state.productiveMinutes + action.minutes,
        currentStreak: Math.max(1, state.currentStreak),
        completedTaskCount: state.completedTaskCount + (hasFinishedTask ? 1 : 0),
        activeAction: hasFinishedTask ? buildNextBestAction(nextTask) : buildNextBestAction({ ...task, progress, riskScore: Math.max(0, task.riskScore - 12) }, { title: task.title, durationMinutes: Math.max(25, task.estimatedMinutes - action.minutes), score: state.activeAction.score, rationale: "The focus block added progress. Continue with the remaining work when you have another clear window." }),
        simulation: { ...state.simulation, announcement: `${action.minutes} focus minutes added. ${task.title} is now ${progress}% complete.` },
        notifications: task.category === "Career"
          ? makeNotification(state, { kind: "career", title: "Career progress updated", description: `${task.title} advanced to ${progress}%.`, href: "/career-path" })
          : state.notifications,
      };
      return result;
    }
    case "complete-task": {
      const task = state.tasks.find((item) => item.id === action.taskId);
      if (!task || task.status === "completed") return state;
      const tasks = state.tasks.map((item) => item.id === action.taskId ? { ...item, status: "completed" as const, progress: 100, riskScore: 0 } : item);
      let careerSkills = state.careerSkills;
      let readiness = state.readiness;
      let evidence = state.evidence;
      let notificationState = state.notifications;
      if (task.id === "docker-lab" && !careerSkills.some((skill) => skill.id === "docker" && skill.status === "verified")) {
        careerSkills = unlockDownstream(careerSkills, "docker");
        readiness = raiseReadiness(readiness, "technical", 2);
        evidence = evidence.map((item) => item.id === "docker-assessment" ? { ...item, status: "verified", confidence: 91, verifiedAt: scenarioDate(0) } : item);
        notificationState = makeNotification(state, { kind: "career", title: "Two pathway milestones unlocked", description: "Docker is verified. CI/CD and Terraform are available.", href: "/career-path" });
      }
      const updated: DemoState = {
        ...state,
        tasks,
        careerSkills,
        evidence,
        readiness,
        completedTaskCount: state.completedTaskCount + 1,
        productiveMinutes: state.productiveMinutes + Math.round(task.estimatedMinutes * (100 - task.progress) / 100),
        currentStreak: Math.max(1, state.currentStreak),
        activeAction: buildNextBestAction(tasks.find((item) => item.status !== "completed") ?? task),
        notifications: notificationState,
      };
      return updated;
    }
    case "complete-skill": {
      const target = state.careerSkills.find((skill) => skill.id === action.skillId);
      if (!target) return state;
      if (action.stage === "verify") {
        if (target.status !== "in-progress") return state;
        return { ...state, careerSkills: state.careerSkills.map((skill) => skill.id === target.id ? { ...skill, status: "verified", proficiency: 100 } : skill) };
      }
      if (action.stage === "unlock") return { ...state, careerSkills: unlockDownstream(state.careerSkills, action.skillId) };
      if (target.status !== "in-progress" && action.stage !== "finish") return state;
      const careerSkills = unlockDownstream(state.careerSkills, action.skillId);
      const readiness = raiseReadiness(state.readiness, "technical", 2);
      const evidence = action.skillId === "docker"
        ? state.evidence.map((item) => item.id === "docker-assessment" ? { ...item, status: "verified" as const, confidence: 91, verifiedAt: scenarioDate(0) } : item)
        : state.evidence;
      const notifications = makeNotification(state, { kind: "career", title: "Two pathway milestones unlocked", description: `${target.name} is verified. New prerequisite steps are available.`, href: "/career-path" });
      const completedTask = action.skillId === "docker" ? state.tasks.find((task) => task.id === "docker-lab" && task.status !== "completed") : undefined;
      const tasks = state.tasks.map((task) => task.id === completedTask?.id ? { ...task, status: "completed" as const, progress: 100, riskScore: 0 } : task);
      const next = tasks.find((task) => task.status !== "completed") ?? tasks[0];
      return {
        ...state,
        careerSkills,
        readiness,
        evidence,
        notifications,
        simulation: { ...state.simulation, announcement: `${target.name} verified → pathway milestones unlocked → +2 Readiness` },
        tasks,
        completedTaskCount: state.completedTaskCount + (completedTask ? 1 : 0),
        productiveMinutes: state.productiveMinutes + (completedTask ? Math.round(completedTask.estimatedMinutes * (100 - completedTask.progress) / 100) : 0),
        currentStreak: Math.max(1, state.currentStreak),
        activeAction: buildNextBestAction(next),
      };
    }
    case "verify-evidence": {
      if (!state.evidence.some((item) => item.id === action.evidenceId && item.status !== "verified")) return state;
      const evidence = state.evidence.map((item) => item.id === action.evidenceId ? { ...item, status: "verified" as const, confidence: Math.max(item.confidence, 91), verifiedAt: scenarioDate(0) } : item);
      const verifiedItem = evidence.find((item) => item.id === action.evidenceId);
      const careerSkills = verifiedItem
        ? state.careerSkills.map((skill) => skill.id === verifiedItem.skillId ? { ...skill, proficiency: Math.min(100, skill.proficiency + 4) } : skill)
        : state.careerSkills;
      const readiness = raiseReadiness(state.readiness, "evidence", 2);
      const notifications = makeNotification(state, { kind: "evidence", title: "Evidence verified", description: `${verifiedItem?.label ?? "New evidence"} now contributes to your confidence score.`, href: "/evidence" });
      return { ...state, evidence, careerSkills, readiness, notifications };
    }
    case "plan-intelligence": {
      const item = state.intelligenceItems.find((candidate) => candidate.id === action.itemId);
      if (!item || item.status === "planned") return state;
      const taskId = `learning-${item.id}`;
      const startAt = scenarioAt(2, "19:00:00");
      const task: Task = {
        id: taskId,
        title: item.title,
        category: "AI Recommended",
        status: "upcoming",
        estimatedMinutes: item.durationMinutes,
        dueAt: scenarioAt(6, "20:00:00"),
        progress: 0,
        difficulty: 2,
        careerSkillIds: item.id.includes("kube") ? ["kubernetes"] : ["cloud"],
        riskScore: 14,
        careerRelevance: 78,
        description: item.whyRelevant,
      };
      const planBlock: PlanBlock = { id: `block-${taskId}`, taskId, title: item.title, category: "AI Recommended", startAt, endAt: endAtMinutes(startAt, item.durationMinutes) };
      const notifications = makeNotification(state, { kind: "plan", title: "Added to Wednesday, 7:00 PM", description: item.title, href: "/planner" });
      return {
        ...state,
        tasks: [...state.tasks, task],
        planBlocks: [...state.planBlocks, planBlock],
        intelligenceItems: state.intelligenceItems.map((candidate) => candidate.id === item.id ? { ...candidate, status: "planned" } : candidate),
        notifications,
        simulation: { ...state.simulation, announcement: `Added ${item.title} to Wednesday, 7:00 PM.` },
      };
    }
    case "add-opportunity-preparation": {
      const tasks: Task[] = [
        { id: "prep-aws-internship", title: "Review AWS IAM essentials", category: "Career", status: "upcoming", estimatedMinutes: 40, dueAt: scenarioAt(4, "18:00:00"), progress: 0, difficulty: 2, careerSkillIds: ["cloud"], riskScore: 18, careerRelevance: 88, description: "Close the AWS gap for your DevOps application." },
        { id: "prep-docker-readme", title: "Polish Docker project README", category: "Career", status: "upcoming", estimatedMinutes: 30, dueAt: scenarioAt(5, "18:00:00"), progress: 0, difficulty: 1, careerSkillIds: ["docker"], riskScore: 14, careerRelevance: 77, description: "Make the project reproducible for a hiring team." },
      ];
      const planBlocks: PlanBlock[] = [
        { id: "block-prep-aws", taskId: tasks[0].id, title: tasks[0].title, category: "Career", startAt: scenarioAt(3, "17:30:00"), endAt: scenarioAt(3, "18:10:00") },
        { id: "block-prep-readme", taskId: tasks[1].id, title: tasks[1].title, category: "Career", startAt: scenarioAt(4, "18:30:00"), endAt: scenarioAt(4, "19:00:00") },
      ];
      return {
        ...state,
        tasks: [...state.tasks.filter((task) => !tasks.some((added) => added.id === task.id)), ...tasks],
        planBlocks: [...state.planBlocks.filter((block) => !planBlocks.some((added) => added.id === block.id)), ...planBlocks],
        notifications: makeNotification(state, { kind: "plan", title: "Preparation tasks added", description: "AWS review and README polish are on your plan.", href: "/planner" }),
        simulation: { ...state.simulation, announcement: "Added two preparation tasks to your adaptive planner." },
      };
    }
    case "select-action": {
      const task = state.tasks.find((item) => item.id === action.taskId);
      return task ? { ...state, activeAction: buildNextBestAction(task), simulation: { ...state.simulation, result: [] } } : state;
    }
    case "mark-notification-read":
      return { ...state, notifications: state.notifications.map((item) => item.id === action.notificationId ? { ...item, read: true } : item) };
    default:
      return state;
  }
}

interface DemoContextValue {
  state: DemoState;
  onboardingReady: boolean;
  updateOnboarding: (patch: Partial<OnboardingState>) => void;
  completeOnboarding: () => boolean;
  submitAssessment: (answers: Record<string, string>) => boolean;
  chooseResource: (skillId: string, resourceId: string) => boolean;
  addFreePath: (skillId: string, pathId: string) => boolean;
  scheduleFreePath: (skillId: string, pathId: string) => Promise<boolean>;
  resetDemo: () => void;
  updateCapacity: (capacity: StudentCapacity) => Promise<void>;
  addUrgentDeadline: () => Promise<void>;
  applyRecoveryPlan: () => Promise<void>;
  generatePlan: () => Promise<void>;
  replanWeek: () => Promise<void>;
  completeTask: (taskId: string) => void;
  completeFocusSession: (taskId: string, minutes: number) => void;
  selectAlternative: (taskId: string) => void;
  completeSkill: (skillId: string) => void;
  verifyEvidence: (evidenceId: string) => void;
  addIntelligenceItemToPlan: (itemId: string) => void;
  addOpportunityPreparation: () => void;
  updatePlanBlock: (block: PlanBlock) => void;
  updateTask: (task: NewTaskInput & { id: string }) => void;
  missTask: (taskId: string) => void;
  addTask: (task: NewTaskInput) => void;
  markNotificationRead: (notificationId: string) => void;
  setFeedStatus: (itemId: string, status: IntelligenceItem["status"]) => void;
  setSimulationAnnouncement: (announcement: string) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const replanSteps = ["Evaluating open tasks…", "Protecting deadlines…", "Recalculating available time…", "Rebuilding schedule…"];

function pause(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, undefined, demoDataAdapter.load);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const runId = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    const saved = readCompletedOnboarding();
    if (saved) dispatch({ type: "hydrate-onboarding", onboarding: saved });
    const assessment = readBaselineAssessment();
    if (assessment) dispatch({ type: "set-assessment", result: assessment });
    setOnboardingReady(true);
  }, []);

  const updateOnboarding = useCallback((patch: Partial<OnboardingState>) => dispatch({ type: "update-onboarding", patch }), []);
  const completeOnboarding = useCallback(() => {
    if (!canCompleteOnboarding(state.onboarding)) return false;
    const completed = { ...state.onboarding, completed: true };
    try { window.localStorage.setItem(onboardingStorageKey, JSON.stringify(completed)); } catch { /* In-memory demo still works. */ }
    dispatch({ type: "complete-onboarding" });
    return true;
  }, [state.onboarding]);

  const submitAssessment = useCallback((answers: Record<string, string>) => {
    if (!state.onboarding.completed || state.onboarding.careerGoal !== "DevOps Engineer") return false;
    const result = scoreBaselineAssessment(answers);
    if (!result) return false;
    try { window.localStorage.setItem(baselineStorageKey, JSON.stringify(result)); } catch { /* In-memory demo still works. */ }
    dispatch({ type: "set-assessment", result });
    return true;
  }, [state.onboarding.completed, state.onboarding.careerGoal]);

  const chooseResource = useCallback((skillId: string, resourceId: string) => {
    if (!state.onboarding.completed || !state.assessment) return false;
    const skill = state.careerSkills.find((item) => item.id === skillId);
    if (!skill || (skill.status !== "available" && skill.status !== "in-progress")) return false;
    if (!recommendLearningResources(skill, state.onboarding).some((item) => item.resource.id === resourceId)) return false;
    dispatch({ type: "choose-resource", skillId, resourceId });
    return true;
  }, [state.assessment, state.careerSkills, state.onboarding]);

  const addFreePath = useCallback((skillId: string, pathId: string) => {
    if (!state.onboarding.completed || !state.assessment) return false;
    const skill = state.careerSkills.find((item) => item.id === skillId);
    if (!skill || (skill.status !== "available" && skill.status !== "in-progress") || freePathForSkill(skillId)?.id !== pathId) return false;
    dispatch({ type: "add-free-path", skillId, pathId });
    return true;
  }, [state.assessment, state.careerSkills, state.onboarding.completed]);

  const resetDemo = useCallback(() => {
    runId.current += 1;
    running.current = false;
    dispatch({ type: "reset" });
  }, []);

  const showSteps = useCallback(async (kind: Exclude<DemoSimulation["kind"], null>, steps: string[], beforeFinish: () => void, onStage?: (index: number) => void) => {
    if (running.current) return;
    running.current = true;
    const id = ++runId.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dispatch({ type: "simulation", patch: { kind, step: steps[0], result: [], message: null } });
    for (const [index, step] of steps.entries()) {
      if (id !== runId.current) return;
      dispatch({ type: "simulation", patch: { step, announcement: step } });
      onStage?.(index);
      await pause(reduced ? 90 : 650);
    }
    if (id !== runId.current) return;
    beforeFinish();
    running.current = false;
  }, []);

  const scheduleFreePath = useCallback(async (skillId: string, pathId: string) => {
    if (running.current || state.selectedFreePathBySkill[skillId] !== pathId || state.scheduledFreePathBySkill[skillId] === pathId) return false;
    const path = freePathForSkill(skillId);
    if (!path || path.id !== pathId || !scheduleLearningPath(state, path)) return false;
    const steps = ["Learning path added", "Capacity checked", "Academic deadlines protected", "Career learning scheduled"];
    await showSteps("learning-path", steps, () => {
      dispatch({ type: "schedule-free-path", skillId, pathId });
      dispatch({ type: "simulation", patch: { kind: null, step: null, message: "Learning path scheduled", result: steps, announcement: steps.join(" → ") } });
    });
    return true;
  }, [showSteps, state]);

  const updateCapacity = useCallback(async (capacity: StudentCapacity) => {
    await showSteps("capacity", capacityStages, () => {
      const lifeLoad = hasLifeLoadFactors(capacity);
      dispatch({ type: "simulation", patch: { kind: null, step: null, message: lifeLoad ? "Life load plan adapted" : "Plan adapted", result: ["Capacity updated", "Risk recalculated", "Schedule optimized", "Next action updated"], announcement: lifeLoad ? isLowCapacity(capacity) ? "You reported limited capacity today, so LumaPath protected your urgent work and moved lower-risk activities." : "Your reported commitments reduced today's planning time. LumaPath updated the plan around your priorities." : "Plan adapted. Your risk, schedule and next action now reflect your capacity." } });
    }, (stage) => dispatch({ type: "capacity-stage", capacity, stage }));
  }, [showSteps]);

  const addUrgentDeadline = useCallback(async () => {
    if (running.current) return;
    const existing = state.planBlocks.find((block) => block.id === "urgent-database-block");
    const urgentBlock: PlanBlock = {
      id: "urgent-database-block",
      taskId: "database-assignment",
      title: "Database Assignment · urgent deadline",
      category: "Academic",
      startAt: scenarioAt(0, "14:00:00"),
      endAt: scenarioAt(0, "15:30:00"),
      isConflict: true,
    };
    dispatch({ type: "patch", patch: {
      tasks: state.tasks.map((task) => task.id === "database-assignment" ? { ...task, dueAt: scenarioAt(1, "23:59:00"), riskScore: 96 } : task),
      planBlocks: existing ? state.planBlocks.map((block) => block.id === urgentBlock.id || block.taskId === "database-assignment" || block.id === "block-docker" ? { ...block, isConflict: true } : block) : [...state.planBlocks.map((block) => block.taskId === "database-assignment" || block.id === "block-docker" ? { ...block, isConflict: true } : block), urgentBlock],
      activeAction: buildNextBestAction(state.tasks.find((task) => task.id === "database-assignment")!, { title: "Protect the urgent database deadline", durationMinutes: 45, score: 94, deadlineRisk: "critical", rationale: "The new deadline is tomorrow. A short implementation block now protects the assignment without losing your focus time.", metrics: { urgency: 98, academicImpact: 92, careerRelevance: 61, capacityFit: 74 }, reasons: [{ label: "Deadline urgency", points: 36 }, { label: "Career relevance", points: 24 }, { label: "Prerequisite importance", points: 19 }, { label: "Academic impact", points: 18 }, { label: "Available capacity", points: 10 }, { label: "Effort penalty", points: -13 }] }),
      simulation: { ...state.simulation, announcement: "Schedule conflict detected. Database Assignment is now at critical risk." },
      notifications: makeNotification(state, { kind: "risk", title: "Urgent Database Assignment added", description: "Your academic workload and weekly plan need a new priority order.", href: "/planner" }),
    } });
    await showSteps("replan", replanSteps, () => {
      const replanResults = ["5 tasks rescheduled", "Critical deadline protected", "Career activity moved to Thursday", "2 focus blocks preserved"];
      dispatch({ type: "patch", patch: {
        planBlocks: blocksAfterUrgentDeadline(state.planBlocks.some((block) => block.id === "urgent-database-block") ? state.planBlocks : [...state.planBlocks, urgentBlock]),
        activeAction: buildNextBestAction(state.tasks.find((task) => task.id === "database-assignment")!, { title: "Protect the urgent database deadline", durationMinutes: 45, score: 94, deadlineRisk: "critical", rationale: "The updated plan protects tomorrow’s submission and preserves two uninterrupted focus windows.", metrics: { urgency: 98, academicImpact: 92, careerRelevance: 61, capacityFit: 74 }, reasons: [{ label: "Deadline urgency", points: 36 }, { label: "Career relevance", points: 24 }, { label: "Prerequisite importance", points: 19 }, { label: "Academic impact", points: 18 }, { label: "Available capacity", points: 10 }, { label: "Effort penalty", points: -13 }] }),
        simulation: { kind: null, step: null, message: "Re-plan complete", result: replanResults, announcement: replanResults.join(". ") },
        notifications: makeNotification(state, { kind: "plan", title: "Week re-planned around the new deadline", description: "Five blocks moved; the critical deadline and focus time are protected.", href: "/planner" }),
      } });
    });
  }, [showSteps, state]);

  const applyRecoveryPlan = useCallback(async () => {
    await showSteps("recovery", ["Checking deadline risk", "Moving AWS Fundamentals to Thursday", "Reserving tonight’s 90-minute focus window"], () => {
      dispatch({ type: "recover-database" });
      dispatch({ type: "simulation", patch: { kind: null, step: null, message: "Recovery plan applied", result: ["AWS Fundamentals moved to Thursday", "Database risk reduced", "90-minute recovery window reserved"], announcement: "Recovery plan applied. Database risk reduced and tonight’s focus window reserved." } });
    });
  }, [showSteps]);

  const generatePlan = useCallback(async () => {
    await showSteps("generate", ["Evaluating your open tasks…", "Checking capacity and due dates…", "Placing focused work blocks…"], () => {
      dispatch({ type: "capacity-stage", capacity: state.capacity, stage: 3 });
      dispatch({ type: "capacity-stage", capacity: state.capacity, stage: 4 });
      dispatch({ type: "simulation", patch: { kind: null, step: null, message: "Plan generated", result: ["Priority blocks placed", "Existing tasks preserved"], announcement: "Plan generated. Priority blocks fit your capacity and existing tasks are preserved." } });
    });
  }, [showSteps, state.capacity]);

  const replanWeek = useCallback(async () => {
    await showSteps("replan", replanSteps, () => {
      const result = ["5 tasks rescheduled", "Critical deadline protected", "Career activity moved to Thursday", "2 focus blocks preserved"];
      dispatch({ type: "patch", patch: { planBlocks: blocksAfterUrgentDeadline(state.planBlocks), simulation: { kind: null, step: null, message: "Week re-planned", result, announcement: result.join(". ") } } });
    });
  }, [showSteps, state.planBlocks]);

  const completeTask = useCallback((taskId: string) => dispatch({ type: "complete-task", taskId }), []);
  const completeFocusSession = useCallback((taskId: string, minutes: number) => dispatch({ type: "complete-focus-session", taskId, minutes }), []);
  const selectAlternative = useCallback((taskId: string) => dispatch({ type: "select-action", taskId }), []);
  const completeSkill = useCallback(async (skillId: string) => {
    const skill = state.careerSkills.find((item) => item.id === skillId);
    if (!skill || skill.status !== "in-progress") return;
    const stages = ["verify", "unlock", "finish"] as const;
    await showSteps("replan", [`${skill.name} verified`, "Unlocking pathway prerequisites", "Updating DevOps Readiness"], () => {
      dispatch({ type: "simulation", patch: { kind: null, step: null, message: "Pathway updated", result: [], announcement: `${skill.name} verified → pathway milestones unlocked → +2 Readiness` } });
    }, (index) => dispatch({ type: "complete-skill", skillId, stage: stages[index] }));
  }, [showSteps, state.careerSkills]);
  const verifyEvidence = useCallback((evidenceId: string) => dispatch({ type: "verify-evidence", evidenceId }), []);
  const addIntelligenceItemToPlan = useCallback((itemId: string) => dispatch({ type: "plan-intelligence", itemId }), []);
  const addOpportunityPreparation = useCallback(() => dispatch({ type: "add-opportunity-preparation" }), []);
  const updatePlanBlock = useCallback((block: PlanBlock) => dispatch({ type: "update-block", block }), []);
  const updateTask = useCallback((task: NewTaskInput & { id: string }) => dispatch({ type: "update-task", task }), []);
  const missTask = useCallback((taskId: string) => dispatch({ type: "miss-task", taskId }), []);
  const markNotificationRead = useCallback((notificationId: string) => dispatch({ type: "mark-notification-read", notificationId }), []);
  const setSimulationAnnouncement = useCallback((announcement: string) => dispatch({ type: "simulation", patch: { announcement } }), []);
  const setFeedStatus = useCallback((itemId: string, status: IntelligenceItem["status"]) => {
    dispatch({ type: "patch", patch: { intelligenceItems: state.intelligenceItems.map((item) => item.id === itemId ? { ...item, status } : item), simulation: { ...state.simulation, announcement: `Intelligence item ${status.replaceAll("-", " ")}.` } } });
  }, [state.intelligenceItems, state.simulation]);

  const addTask = useCallback((input: NewTaskInput) => {
    const id = `task-${state.tasks.length + 1}`;
    const task: Task = { id, title: input.title, category: input.category as TaskCategory, status: "upcoming", estimatedMinutes: input.estimatedMinutes, dueAt: input.dueAt, progress: 0, difficulty: 2, careerSkillIds: [], riskScore: 35, careerRelevance: input.category === "Career" ? 72 : 35, description: input.description ?? "A planned task added to your demo workspace." };
    const block: PlanBlock = { id: `block-${id}`, taskId: id, title: input.title, category: input.category, startAt: input.startAt, endAt: endAtMinutes(input.startAt, input.estimatedMinutes) };
    dispatch({ type: "patch", patch: { tasks: [...state.tasks, task], planBlocks: [...state.planBlocks, block], simulation: { ...state.simulation, announcement: `${input.title} added to your plan.` } } });
  }, [state.planBlocks, state.simulation, state.tasks]);

  const value = useMemo<DemoContextValue>(() => ({
    state,
    onboardingReady,
    updateOnboarding,
    completeOnboarding,
    submitAssessment,
    chooseResource,
    addFreePath,
    scheduleFreePath,
    resetDemo,
    updateCapacity,
    addUrgentDeadline,
    applyRecoveryPlan,
    generatePlan,
    replanWeek,
    completeTask,
    completeFocusSession,
    selectAlternative,
    completeSkill,
    verifyEvidence,
    addIntelligenceItemToPlan,
    addOpportunityPreparation,
    updatePlanBlock,
    updateTask,
    missTask,
    addTask,
    markNotificationRead,
    setFeedStatus,
    setSimulationAnnouncement,
  }), [state, onboardingReady, updateOnboarding, completeOnboarding, submitAssessment, chooseResource, addFreePath, scheduleFreePath, resetDemo, updateCapacity, addUrgentDeadline, applyRecoveryPlan, generatePlan, replanWeek, completeTask, completeFocusSession, selectAlternative, completeSkill, verifyEvidence, addIntelligenceItemToPlan, addOpportunityPreparation, updatePlanBlock, updateTask, missTask, addTask, markNotificationRead, setFeedStatus, setSimulationAnnouncement]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider.");
  return context;
}

export function demoRiskLabel(score: number) {
  return riskLevel(score);
}
