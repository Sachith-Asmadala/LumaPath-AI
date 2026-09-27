import { freePathForSkill } from "../demo-data/free-learning-paths";
import type { DemoState } from "../demo-data/types";

export interface SkillReassessmentQuestion {
  id: string;
  question: string;
  options: readonly string[];
  correctAnswer: string;
}

export const dockerReassessmentQuestions: readonly SkillReassessmentQuestion[] = [
  { id: "docker-image", question: "What does a Docker image provide?", options: ["A read-only template for creating containers", "A running container", "A private network", "A persistent volume"], correctAnswer: "A read-only template for creating containers" },
  { id: "docker-build", question: "Which command builds an image from a Dockerfile in the current directory?", options: ["docker build -t my-app .", "docker run my-app .", "docker volume create my-app", "docker compose down"], correctAnswer: "docker build -t my-app ." },
  { id: "docker-network", question: "How can two containers on the same user-defined network reach each other?", options: ["By container or service name", "Only through localhost", "Only through a public IP", "By image tag"], correctAnswer: "By container or service name" },
  { id: "docker-volume", question: "What keeps application data when its container is removed?", options: ["A named volume", "The container's writable layer", "An EXPOSE instruction", "A build cache"], correctAnswer: "A named volume" },
  { id: "docker-compose", question: "What is Docker Compose used for?", options: ["Defining and running a multi-service application", "Publishing an image registry", "Replacing a Dockerfile", "Scanning Git commits"], correctAnswer: "Defining and running a multi-service application" },
];

export function scoreDockerReassessment(answers: Record<string, string>): { score: number; correctCount: number } | null {
  if (!dockerReassessmentQuestions.every((question) => question.options.includes(answers[question.id]))) return null;
  const correctCount = dockerReassessmentQuestions.filter((question) => answers[question.id] === question.correctAnswer).length;
  return { score: Math.round(correctCount / dockerReassessmentQuestions.length * 100), correctCount };
}

/** Course and practice finish the path; project evidence remains an independent status. */
export function selectLearningPathCompletion(state: DemoState, skillId: string) {
  const path = freePathForSkill(skillId);
  if (!path || state.scheduledFreePathBySkill[skillId] !== path.id) return null;
  const completeStep = (stepId: string) => {
    const tasks = state.tasks.filter((task) => task.id.startsWith(`learning-${path.id}-${stepId}-`));
    return tasks.length > 0 && tasks.every((task) => task.status === "completed");
  };
  const courseComplete = path.steps.filter((step) => step.kind === "official documentation" || step.kind === "selected YouTube learning").every((step) => completeStep(step.id));
  const practiceComplete = path.steps.filter((step) => step.kind === "free lab").every((step) => completeStep(step.id));
  const projectComplete = path.steps.filter((step) => step.kind === "portfolio project").every((step) => completeStep(step.id));
  return { path, courseComplete, practiceComplete, projectComplete, pathComplete: courseComplete && practiceComplete, assessmentComplete: Boolean(state.skillReassessments[skillId]) };
}
