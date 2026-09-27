import type { LearningStyle } from "./types";

export type ResourceLevel = "beginner" | "intermediate" | "advanced";
export type ResourceCostType = "free" | "one-time" | "subscription";
export type ResourceProvider = "Coursera" | "Udemy" | "YouTube" | "Docker Docs";

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
  language: string;
  handsOnScore: number;
  credentialScore: number;
  url: string;
}

/** Local prototype examples. Provider links lead to discovery pages or official docs. */
export const learningResources: readonly LearningResource[] = [
  { id: "docker-coursera-projects", title: "Docker guided projects", provider: "Coursera", skill: "docker", level: "beginner", costType: "subscription", price: 19, certificate: true, durationHours: 12, format: "projects", language: "English", handsOnScore: 85, credentialScore: 90, url: "https://www.coursera.org/search?query=docker%20guided%20projects" },
  { id: "docker-coursera-foundations", title: "Docker and containers foundations", provider: "Coursera", skill: "docker", level: "intermediate", costType: "subscription", price: 19, certificate: true, durationHours: 16, format: "video", language: "English", handsOnScore: 64, credentialScore: 88, url: "https://www.coursera.org/search?query=docker%20containers" },
  { id: "docker-udemy-practical", title: "Practical Docker course path", provider: "Udemy", skill: "docker", level: "intermediate", costType: "one-time", price: 18, certificate: true, durationHours: 18, format: "hands-on", language: "English", handsOnScore: 94, credentialScore: 70, url: "https://www.udemy.com/topic/docker/" },
  { id: "docker-youtube-course", title: "Docker full-course video path", provider: "YouTube", skill: "docker", level: "beginner", costType: "free", price: 0, certificate: false, durationHours: 6, format: "video", language: "English", handsOnScore: 56, credentialScore: 0, url: "https://www.youtube.com/results?search_query=docker+full+course" },
  { id: "docker-docs-start", title: "Get started with Docker", provider: "Docker Docs", skill: "docker", level: "beginner", costType: "free", price: 0, certificate: false, durationHours: 8, format: "hands-on", language: "English", handsOnScore: 96, credentialScore: 0, url: "https://docs.docker.com/get-started/" },
  { id: "docker-docs-workshop", title: "Docker workshop", provider: "Docker Docs", skill: "docker", level: "intermediate", costType: "free", price: 0, certificate: false, durationHours: 4, format: "hands-on", language: "English", handsOnScore: 100, credentialScore: 0, url: "https://docs.docker.com/get-started/workshop/" },
];
