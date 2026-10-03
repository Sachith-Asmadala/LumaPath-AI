import { withKnowledgeResponses } from "@/features/assessment/domain/knowledge-responses";
import { learningProgress } from "@/features/learning/domain/learning";
import type { DemoState } from "@/data/demo/types";

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
].map(question => ({ ...question, options: withKnowledgeResponses(question.options) }));

export function scoreDockerReassessment(answers: Record<string, string>): { score: number; correctCount: number } | null {
  if (!dockerReassessmentQuestions.every((question) => question.options.includes(answers[question.id]))) return null;
  const correctCount = dockerReassessmentQuestions.filter((question) => answers[question.id] === question.correctAnswer).length;
  return { score: Math.round(correctCount / dockerReassessmentQuestions.length * 100), correctCount };
}

/** Course and practice finish the path; project evidence remains an independent status. */
export function selectLearningPathCompletion(state: DemoState, skillId: string) {
  const learning = learningProgress(state, skillId);
  if (!learning?.scheduled) return null;
  const { path, steps } = learning;
  const course = steps.filter((step) => step.kind === "guided course" || step.kind === "official documentation" || step.kind === "selected YouTube learning");
  const practice = steps.filter((step) => step.kind === "free lab");
  const project = steps.filter((step) => step.kind === "portfolio project");
  const courseComplete = course.length > 0 && course.every((step) => step.complete);
  const practiceComplete = practice.length > 0 && practice.every((step) => step.complete);
  const projectComplete = project.length > 0 && project.every((step) => step.complete) && state.evidence.some((item) => item.kind === "project" && item.skillId === skillId && Boolean(item.url));
  return { path, courseComplete, practiceComplete, projectComplete, pathComplete: courseComplete && practiceComplete, assessmentComplete: Boolean(state.skillReassessments[skillId]?.passed) };
}
