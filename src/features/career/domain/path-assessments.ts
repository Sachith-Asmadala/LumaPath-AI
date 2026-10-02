import { dockerReassessmentQuestions, type SkillReassessmentQuestion } from "@/features/career/domain/skill-reassessment";

type QuestionSeed = [string, string, string, string, string, string];
const bank: Record<string, readonly QuestionSeed[]> = {
  linux: [
    ["permissions", "Which permission lets a file be run as a program?", "Execute", "Read", "Write", "Ownership"],
    ["location", "Which command prints the current directory?", "pwd", "mkdir", "chmod", "ps"],
    ["process", "What does a process ID identify?", "A running process", "A file permission", "A user password", "A network cable"],
  ],
  git: [
    ["commit", "What does a commit record?", "A snapshot of tracked changes", "Only a branch name", "A remote password", "An installed package"],
    ["branch", "Why use a feature branch?", "To isolate work before integrating it", "To remove version history", "To store production secrets", "To disable code review"],
    ["conflict", "How should a merge conflict be resolved?", "Review competing edits and commit the intended result", "Always delete both files", "Force-push without review", "Ignore conflict markers"],
  ],
  networking: [
    ["dns", "What does DNS primarily map?", "Names to network addresses", "Passwords to users", "Images to containers", "Files to commits"],
    ["port", "What does a TCP port help identify?", "A service endpoint on a host", "A geographic location", "A hardware serial number", "A database row"],
    ["http", "What does HTTP 404 indicate?", "The requested resource was not found", "The request succeeded", "The server redirected the browser", "TLS encryption failed"],
  ],
  cicd: [
    ["failure", "What should a release pipeline do when required tests fail?", "Block deployment and surface the failure", "Deploy anyway", "Delete the tests", "Hide the build log"],
    ["secret", "Where should deployment tokens be stored?", "In a restricted secret store", "In source code", "In a public artifact", "In an issue comment"],
    ["artifact", "Why deploy the artifact that was tested?", "To keep tested and released software consistent", "To skip security checks", "To avoid version control", "To make builds larger"],
  ],
  cloud: [
    ["privilege", "What is least privilege?", "Granting only necessary permissions", "Giving every user admin access", "Removing access logs", "Sharing root credentials"],
    ["scale", "What is horizontal scaling?", "Adding service instances", "Adding RAM to one machine", "Increasing disk size only", "Removing backups"],
    ["responsibility", "Who remains responsible for configuring access to customer data?", "The customer within the shared responsibility model", "Nobody", "Every internet user", "Only the hardware manufacturer"],
  ],
  terraform: [
    ["plan", "What does terraform plan show?", "Proposed infrastructure changes", "Only billing history", "Application test coverage", "A Git merge result"],
    ["state", "What does Terraform state track?", "The mapping between configuration and managed resources", "Only network traffic", "User login sessions", "CI test assertions"],
    ["provider", "What is a Terraform provider?", "An integration for managing a platform’s resources", "A source-code formatter", "A container network", "A password manager"],
  ],
  kubernetes: [
    ["pod", "What is a Pod?", "A group of co-scheduled containers sharing network context", "A Git branch", "A cloud subscription", "A container registry"],
    ["service", "Why use a Kubernetes Service?", "To provide stable access to a set of Pods", "To build container images", "To replace all readiness checks", "To store Git history"],
    ["readiness", "What does a failed readiness probe usually affect?", "Whether the Pod receives service traffic", "The image’s source code", "The cluster’s billing account", "The Git commit author"],
  ],
  monitoring: [
    ["counter", "Which metric fits total requests served?", "A counter", "A password", "A Git tag", "A container image"],
    ["gauge", "Which metric fits current memory use?", "A gauge", "An immutable commit", "A certificate", "A deployment token"],
    ["alert", "What makes an operational alert useful?", "A clear symptom, threshold, and response runbook", "Firing for every log message", "No owner or next step", "Hiding the affected service"],
  ],
};
export function reassessmentQuestions(skillId: string): readonly SkillReassessmentQuestion[] {
  if (skillId === "docker") return dockerReassessmentQuestions;
  return (bank[skillId] ?? []).map(([id, question, correctAnswer, ...other]) => ({ id: `${skillId}-${id}`, question, correctAnswer, options: [correctAnswer, ...other] }));
}
export function scoreSkillReassessment(skillId: string, answers: Record<string, string>) {
  const questions = reassessmentQuestions(skillId);
  if (!questions.length || !questions.every((question) => question.options.includes(answers[question.id]))) return null;
  const correctCount = questions.filter((question) => question.correctAnswer === answers[question.id]).length;
  return { score: Math.round(correctCount / questions.length * 100), correctCount, questions };
}
