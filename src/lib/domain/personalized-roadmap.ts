import type { BaselineAssessmentResult, BaselineSkill, CareerSkill } from "../demo-data/types";

type RoadmapStep = {
  id: string;
  name: string;
  baselineSkill?: BaselineSkill;
  targetScore: number;
  learningHours: number;
  description: string;
};

export const devOpsRoadmapSteps: readonly RoadmapStep[] = [
  { id: "linux", name: "Linux", baselineSkill: "Linux", targetScore: 70, learningHours: 10, description: "Work confidently with the shell, permissions, processes, and services." },
  { id: "git", name: "Git", baselineSkill: "Git", targetScore: 70, learningHours: 8, description: "Use branches, reviews, and a reliable version control workflow." },
  { id: "networking", name: "Networking", baselineSkill: "Networking", targetScore: 60, learningHours: 10, description: "Understand DNS, HTTP, ports, routing, and service connectivity." },
  { id: "docker", name: "Docker", baselineSkill: "Docker", targetScore: 75, learningHours: 18, description: "Build, network, and ship reliable containerized services." },
  { id: "cicd", name: "CI/CD", baselineSkill: "CI/CD", targetScore: 75, learningHours: 18, description: "Automate tests, builds, and deployments with safe pipelines." },
  { id: "cloud", name: "Cloud", baselineSkill: "Cloud", targetScore: 75, learningHours: 18, description: "Deploy services with sound identity, scaling, and reliability practices." },
  { id: "terraform", name: "Terraform", targetScore: 75, learningHours: 20, description: "Provision infrastructure with versioned, repeatable configuration." },
  { id: "kubernetes", name: "Kubernetes", targetScore: 75, learningHours: 24, description: "Orchestrate containers and maintain healthy workloads." },
  { id: "monitoring", name: "Monitoring", targetScore: 75, learningHours: 14, description: "Measure service health and respond to operational signals." },
];

export function roadmapUnlocks(skills: readonly CareerSkill[], skillId: string): string[] {
  return skills.filter((skill) => skill.prerequisites.includes(skillId)).map((skill) => skill.name);
}

export function buildDevOpsRoadmap(
  result: BaselineAssessmentResult,
  previous: readonly CareerSkill[],
  weeklyLearningHours: number,
  recommendedSkill: BaselineSkill | null,
): CareerSkill[] {
  const hoursPerWeek = Math.max(1, weeklyLearningHours || 6);
  const previousById = new Map(previous.map((skill) => [skill.id, skill]));
  const skills: CareerSkill[] = devOpsRoadmapSteps.map((step, index) => {
    const score = step.baselineSkill ? result.skillScores[step.baselineSkill] : 0;
    const prerequisite = index > 0 ? [devOpsRoadmapSteps[index - 1].id] : [];
    const prior = previousById.get(step.id);
    const priorVerified = prior?.status === "verified";
    const status = priorVerified ? "verified" : score >= step.targetScore ? "completed" : "locked";
    const remainingFactor = Math.max(0.6, (step.targetScore - score) / step.targetScore);
    return {
      id: step.id,
      name: step.name,
      status,
      proficiency: priorVerified ? Math.max(prior.proficiency, score) : score,
      targetScore: step.targetScore,
      estimatedWeeks: Math.max(1, Math.ceil(step.learningHours * remainingFactor / hoursPerWeek)),
      prerequisites: prerequisite,
      description: step.description,
    };
  });

  for (const skill of skills) {
    if (skill.status !== "locked") continue;
    const ready = skill.prerequisites.every((id) => skills.some((candidate) =>
      candidate.id === id && (candidate.status === "verified" || candidate.status === "completed")));
    if (ready) skill.status = previousById.get(skill.id)?.status === "in-progress" ? "in-progress" : "available";
  }

  const preferred = skills.find((skill) => skill.name === recommendedSkill && skill.status === "available");
  const current = preferred ?? skills.find((skill) => skill.status === "available");
  if (current && current.proficiency > 0) current.status = "in-progress";
  return skills;
}
