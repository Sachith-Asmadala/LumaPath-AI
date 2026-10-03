import { withKnowledgeResponses } from "@/features/assessment/domain/knowledge-responses";
import type { BaselineAssessmentResult, BaselineSkill } from "@/data/demo/types";

export interface BaselineQuestion {
  id: string;
  skill: BaselineSkill;
  question: string;
  options: readonly string[];
  correctAnswer: string;
  weight: number;
}

export const baselineSkills: readonly BaselineSkill[] = ["Linux", "Git", "Networking", "Docker", "CI/CD", "Cloud"];

export const baselineQuestions: readonly BaselineQuestion[] = ([
  { id: "linux-permissions", skill: "Linux", question: "Which command makes deploy.sh executable for its owner?", options: ["chmod u+x deploy.sh", "chmod u-x deploy.sh", "chown +x deploy.sh", "sudo run deploy.sh"], correctAnswer: "chmod u+x deploy.sh", weight: 1 },
  { id: "linux-ports", skill: "Linux", question: "Which command shows processes listening on TCP ports?", options: ["ss -ltnp", "ls -la", "df -h", "cat /etc/hosts"], correctAnswer: "ss -ltnp", weight: 2 },
  { id: "git-branch", skill: "Git", question: "Which command creates and switches to a new branch named feature/api?", options: ["git switch -c feature/api", "git switch feature/api", "git commit feature/api", "git fetch feature/api"], correctAnswer: "git switch -c feature/api", weight: 1 },
  { id: "git-rebase", skill: "Git", question: "What does rebasing a feature branch onto main do?", options: ["Replays the feature commits on top of main", "Deletes the feature commits", "Uploads the branch to the remote", "Creates a merge commit on main"], correctAnswer: "Replays the feature commits on top of main", weight: 2 },
  { id: "network-dns", skill: "Networking", question: "Which system resolves a hostname to an IP address?", options: ["DNS", "SSH", "TLS", "NAT"], correctAnswer: "DNS", weight: 1 },
  { id: "network-502", skill: "Networking", question: "A reverse proxy returns HTTP 502. What does it usually mean?", options: ["It received an invalid response from an upstream server", "The browser has no network connection", "The page moved permanently", "The user has insufficient permissions"], correctAnswer: "It received an invalid response from an upstream server", weight: 2 },
  { id: "docker-cmd", skill: "Docker", question: "Which Dockerfile instruction supplies the default command when a container starts?", options: ["CMD", "COPY", "EXPOSE", "FROM"], correctAnswer: "CMD", weight: 1 },
  { id: "docker-compose", skill: "Docker", question: "How can services in the same Docker Compose network address each other?", options: ["By service name", "Only by public IP address", "Only through localhost", "By image tag"], correctAnswer: "By service name", weight: 2 },
  { id: "cicd-tests", skill: "CI/CD", question: "Which pipeline step should catch regressions before deployment?", options: ["Run automated tests", "Delete build logs", "Rotate the dashboard theme", "Tag the release before building"], correctAnswer: "Run automated tests", weight: 1 },
  { id: "cicd-secrets", skill: "CI/CD", question: "Where should a CI pipeline keep deployment credentials?", options: ["In the CI platform's secret store", "Committed in the repository", "In a public build artifact", "In the README"], correctAnswer: "In the CI platform's secret store", weight: 2 },
  { id: "cloud-scale", skill: "Cloud", question: "What does horizontal scaling add to an application?", options: ["More running instances", "More memory to one instance", "A longer timeout", "A larger disk on one instance"], correctAnswer: "More running instances", weight: 1 },
  { id: "cloud-privilege", skill: "Cloud", question: "What does the principle of least privilege require?", options: ["Grant only the permissions needed for a task", "Give every service administrator access", "Share one credential across all services", "Disable audit logs after deployment"], correctAnswer: "Grant only the permissions needed for a task", weight: 2 },
] satisfies BaselineQuestion[]).map(question => ({ ...question, options: withKnowledgeResponses(question.options) }));

export function scoreBaselineAssessment(answers: Record<string, string>): BaselineAssessmentResult | null {
  if (!baselineQuestions.every((question) => question.options.includes(answers[question.id]))) return null;

  const skillScores = {} as Record<BaselineSkill, number>;
  for (const skill of baselineSkills) {
    const questions = baselineQuestions.filter((question) => question.skill === skill);
    const totalWeight = questions.reduce((sum, question) => sum + question.weight, 0);
    const earnedWeight = questions.reduce((sum, question) => sum + (answers[question.id] === question.correctAnswer ? question.weight : 0), 0);
    skillScores[skill] = Math.round((earnedWeight / totalWeight) * 100);
  }

  const totalWeight = baselineQuestions.reduce((sum, question) => sum + question.weight, 0);
  const earnedWeight = baselineQuestions.reduce((sum, question) => sum + (answers[question.id] === question.correctAnswer ? question.weight : 0), 0);
  return {
    answers: Object.fromEntries(baselineQuestions.map((question) => [question.id, answers[question.id]])),
    overallScore: Math.round((earnedWeight / totalWeight) * 100),
    skillScores,
    correctCount: baselineQuestions.filter((question) => answers[question.id] === question.correctAnswer).length,
    totalQuestions: baselineQuestions.length,
  };
}

export const baselineStorageKey = "lumapath-baseline-v1";

export function readBaselineAssessment(): BaselineAssessmentResult | null {
  try {
    const raw = window.localStorage.getItem(baselineStorageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("answers" in parsed) || !parsed.answers || typeof parsed.answers !== "object") return null;
    return scoreBaselineAssessment(parsed.answers as Record<string, string>);
  } catch {
    return null;
  }
}
