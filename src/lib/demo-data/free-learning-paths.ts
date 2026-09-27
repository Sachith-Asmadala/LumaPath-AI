export type FreePathStepKind = "official documentation" | "selected YouTube learning" | "free lab" | "portfolio project" | "mini assessment";

export interface FreePathSource {
  label: string;
  url: string;
}

export interface FreePathStep {
  id: string;
  title: string;
  kind: FreePathStepKind;
  durationHours: number;
  outcome: string;
  sources: readonly FreePathSource[];
}

export interface FreeLearningPath {
  id: string;
  skillId: string;
  title: string;
  costUSD: 0;
  durationHours: number;
  skillsCovered: readonly string[];
  evidenceEarned: readonly string[];
  steps: readonly FreePathStep[];
}

export const freeLearningPaths: readonly FreeLearningPath[] = [
  {
    id: "docker-open-path",
    skillId: "docker",
    title: "Docker Open Learning Path",
    costUSD: 0,
    durationHours: 18,
    skillsCovered: ["Docker fundamentals", "Images and containers", "Networking and volumes", "Docker Compose", "Containerizing an application"],
    evidenceEarned: ["Completed Docker workshop notes", "Containerized project repository with Dockerfile and Compose file", "LumaPath mini assessment result and skill verification record"],
    steps: [
      { id: "fundamentals", title: "Docker fundamentals", kind: "official documentation", durationHours: 2, outcome: "Explain images, containers, registries, and why containerization helps a team ship software.", sources: [{ label: "Docker Docs · Get started", url: "https://docs.docker.com/get-started/" }] },
      { id: "images-containers", title: "Images and containers", kind: "selected YouTube learning", durationHours: 2, outcome: "Build an image, run a container, inspect logs, and explain the Dockerfile instructions you used.", sources: [{ label: "YouTube · Docker for beginners video path", url: "https://www.youtube.com/results?search_query=TechWorld+with+Nana+Docker+Tutorial+for+Beginners" }, { label: "Docker Docs · Dockerfile overview", url: "https://docs.docker.com/build/concepts/dockerfile/" }] },
      { id: "network-volumes", title: "Networking and volumes", kind: "official documentation", durationHours: 3, outcome: "Connect two containers and persist data with a named volume.", sources: [{ label: "Docker Docs · Networking", url: "https://docs.docker.com/engine/network/" }, { label: "Docker Docs · Volumes", url: "https://docs.docker.com/engine/storage/volumes/" }] },
      { id: "compose", title: "Docker Compose", kind: "official documentation", durationHours: 2, outcome: "Define and run a small multi-service app with a Compose file.", sources: [{ label: "Docker Docs · Compose", url: "https://docs.docker.com/compose/" }] },
      { id: "lab", title: "Hands-on lab", kind: "free lab", durationHours: 3, outcome: "Complete the official Docker workshop and record the commands and fixes you used.", sources: [{ label: "Docker Docs · Docker workshop", url: "https://docs.docker.com/get-started/workshop/" }] },
      { id: "project", title: "Containerize a real project", kind: "portfolio project", durationHours: 5, outcome: "Add a Dockerfile and Compose setup to a real app, including a database volume and a README with run instructions.", sources: [] },
      { id: "verification", title: "LumaPath skill verification", kind: "mini assessment", durationHours: 1, outcome: "Complete a local mini assessment on images, networking, volumes, and Compose, then present the project repository for verification.", sources: [] },
    ],
  },
];

export function freePathForSkill(skillId: string): FreeLearningPath | undefined {
  return freeLearningPaths.find((path) => path.skillId === skillId);
}

export function freePathWeeks(path: FreeLearningPath, weeklyLearningHours: number): number {
  return Math.ceil(path.durationHours / Math.max(1, weeklyLearningHours));
}
