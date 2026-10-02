import { devOpsLearning } from "@/data/demo/devops-learning";
import type { LearningStyle } from "@/data/demo/types";

export type ResourceLevel = "beginner" | "intermediate" | "advanced";
export type ResourceCostType = "free" | "one-time" | "subscription";
export type ResourceProvider = "Coursera" | "Udemy" | "YouTube" | "Docker Docs" | "Official learning" | "LumaPath Notes";
export type ResourceContentType = "course" | "video" | "notes" | "documentation" | "lab" | "project";

export interface LearningResource {
  id: string;
  title: string;
  provider: ResourceProvider;
  skill: string;
  level: ResourceLevel;
  costType: ResourceCostType;
  /** Illustrative USD amount for prototype matching, not a live price. */
  price: number;
  certificate: boolean;
  durationHours: number;
  format: LearningStyle;
  contentType: ResourceContentType;
  language: string;
  handsOnScore: number;
  credentialScore: number;
  qualityScore: number;
  tags: readonly string[];
  url: string;
}

/** Local prototype examples. Provider links lead to discovery pages or official docs. */
const dockerResources: readonly LearningResource[] = [
  { id: "docker-coursera-projects", title: "Docker guided projects", provider: "Coursera", skill: "docker", level: "beginner", costType: "subscription", price: 19, certificate: true, durationHours: 12, format: "projects", contentType: "course", language: "English", handsOnScore: 85, credentialScore: 90, qualityScore: 88, tags: ["containers", "projects", "certificate"], url: "https://www.coursera.org/search?query=docker%20guided%20projects" },
  { id: "docker-coursera-foundations", title: "Docker and containers foundations", provider: "Coursera", skill: "docker", level: "intermediate", costType: "subscription", price: 19, certificate: true, durationHours: 16, format: "video", contentType: "course", language: "English", handsOnScore: 64, credentialScore: 88, qualityScore: 84, tags: ["containers", "foundations", "certificate"], url: "https://www.coursera.org/search?query=docker%20containers" },
  { id: "docker-udemy-practical", title: "Practical Docker course path", provider: "Udemy", skill: "docker", level: "intermediate", costType: "one-time", price: 18, certificate: true, durationHours: 18, format: "hands-on", contentType: "course", language: "English", handsOnScore: 94, credentialScore: 70, qualityScore: 83, tags: ["hands-on", "containers", "certificate"], url: "https://www.udemy.com/topic/docker/" },
  { id: "docker-youtube-course", title: "Docker full-course video path", provider: "YouTube", skill: "docker", level: "beginner", costType: "free", price: 0, certificate: false, durationHours: 6, format: "video", contentType: "video", language: "English", handsOnScore: 56, credentialScore: 0, qualityScore: 74, tags: ["video", "free", "containers"], url: "https://www.youtube.com/results?search_query=docker+full+course" },
  { id: "docker-youtube-crash", title: "Docker crash-course videos", provider: "YouTube", skill: "docker", level: "beginner", costType: "free", price: 0, certificate: false, durationHours: 2, format: "video", contentType: "video", language: "English", handsOnScore: 48, credentialScore: 0, qualityScore: 72, tags: ["video", "quick-start", "free"], url: "https://www.youtube.com/results?search_query=docker+crash+course+containers" },
  { id: "docker-notes-core", title: "Docker core concepts notes", provider: "LumaPath Notes", skill: "docker", level: "beginner", costType: "free", price: 0, certificate: false, durationHours: 1, format: "reading", contentType: "notes", language: "English", handsOnScore: 25, credentialScore: 0, qualityScore: 86, tags: ["notes", "images", "containers", "commands"], url: "https://docs.docker.com/get-started/docker-concepts/" },
  { id: "docker-notes-cheatsheet", title: "Docker command reference notes", provider: "LumaPath Notes", skill: "docker", level: "intermediate", costType: "free", price: 0, certificate: false, durationHours: 1, format: "reading", contentType: "notes", language: "English", handsOnScore: 34, credentialScore: 0, qualityScore: 82, tags: ["notes", "commands", "reference", "cli"], url: "https://docs.docker.com/reference/cli/docker/" },
  { id: "docker-docs-start", title: "Get started with Docker", provider: "Docker Docs", skill: "docker", level: "beginner", costType: "free", price: 0, certificate: false, durationHours: 8, format: "hands-on", contentType: "documentation", language: "English", handsOnScore: 96, credentialScore: 0, qualityScore: 98, tags: ["official", "containers", "hands-on"], url: "https://docs.docker.com/get-started/" },
  { id: "docker-docs-workshop", title: "Docker workshop", provider: "Docker Docs", skill: "docker", level: "intermediate", costType: "free", price: 0, certificate: false, durationHours: 4, format: "hands-on", contentType: "lab", language: "English", handsOnScore: 100, credentialScore: 0, qualityScore: 98, tags: ["official", "lab", "hands-on"], url: "https://docs.docker.com/get-started/workshop/" },
];

export const learningResources: readonly LearningResource[] = [...dockerResources, ...devOpsLearning.map((item): LearningResource => ({
  id: `${item.skillId}-official`, title: `${item.name} foundations · ${item.provider}`, provider: "Official learning", skill: item.skillId,
  level: "beginner", costType: "free", price: 0, certificate: false, durationHours: 2, format: "reading", contentType: "documentation", language: "English", handsOnScore: 70, credentialScore: 0, qualityScore: 92, tags: ["official", "foundations", item.skillId], url: item.url,
}))];
