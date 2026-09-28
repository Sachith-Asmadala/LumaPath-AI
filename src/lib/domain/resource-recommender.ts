import { learningResources, type LearningResource, type ResourceLevel } from "../demo-data/resources";
import type { CareerSkill, OnboardingState } from "../demo-data/types";

export type RecommendationLabel = "Best Overall" | "Best Credential Option" | "Best Free/Open Learning Path";

export interface ResourceRecommendation {
  label: RecommendationLabel;
  resource: LearningResource;
  matchScore: number;
  reasons: string[];
}

const levels: readonly ResourceLevel[] = ["beginner", "intermediate", "advanced"];

export function levelFromScore(score: number): ResourceLevel {
  if (score >= 70) return "advanced";
  return score >= 40 ? "intermediate" : "beginner";
}

export function isWithinBudget(resource: LearningResource, budget: OnboardingState["budget"]): boolean {
  if (budget === "free only") return resource.costType === "free" && resource.price === 0;
  if (budget === "under $20/month") return resource.costType === "free" || resource.price < 20;
  return true;
}

function resourceMatch(resource: LearningResource, skill: Pick<CareerSkill, "name" | "proficiency">, preferences: OnboardingState) {
  const level = levelFromScore(skill.proficiency);
  const hours = Math.max(1, preferences.weeklyLearningHours);
  const preferredFormat = preferences.preferredLearning.includes(resource.format);
  const certificatePreferred = preferences.certificatePreference ? preferences.certificatePreference !== "not important" : preferences.goal === "certification";
  const exactLevel = resource.level === level;
  const free = resource.costType === "free";
  const matchScore = Math.min(100, 15
    + (exactLevel ? 20 : 10)
    + (preferredFormat ? 18 : 4)
    + Math.round(resource.handsOnScore * 0.12)
    + (certificatePreferred ? (resource.certificate ? Math.round(resource.credentialScore * 0.15) : 0) : resource.certificate ? 5 : 0)
    + (resource.durationHours <= hours * 2 ? 12 : 6)
    + (free ? 10 : 6));

  const reasons = [
    exactLevel ? `Matches your current ${skill.name} level (${level}).` : `Offers a nearby level for your ${level} starting point.`,
    `Fits ${hours} hours/week in about ${Math.ceil(resource.durationHours / hours)} ${Math.ceil(resource.durationHours / hours) === 1 ? "week" : "weeks"}.`,
  ];
  if (preferredFormat) reasons.push(`Uses your preferred ${resource.format} format.`);
  if (resource.handsOnScore >= 75) reasons.push("Includes hands-on practice.");
  reasons.push(free ? "Free/open learning within your budget." : "Within your selected demo budget.");
  if (resource.certificate) reasons.push("Certificate available.");
  reasons.push(`Available in ${resource.language}.`);
  return { resource, matchScore, reasons };
}

export function recommendLearningResources(
  skill: Pick<CareerSkill, "id" | "name" | "proficiency">,
  preferences: OnboardingState,
  catalog: readonly LearningResource[] = learningResources,
): ResourceRecommendation[] {
  const currentLevel = levelFromScore(skill.proficiency);
  const hours = Math.max(1, preferences.weeklyLearningHours);
  const candidates = catalog.filter((resource) =>
    resource.skill === skill.id
    && resource.language.trim().toLowerCase() === preferences.language.trim().toLowerCase()
    && isWithinBudget(resource, preferences.budget)
    && (preferences.certificatePreference !== "required" || resource.certificate)
    && resource.durationHours <= hours * 4
    && Math.abs(levels.indexOf(resource.level) - levels.indexOf(currentLevel)) <= 1,
  ).map((resource) => resourceMatch(resource, skill, preferences))
    .sort((a, b) => b.matchScore - a.matchScore || a.resource.id.localeCompare(b.resource.id));

  const selected: ResourceRecommendation[] = [];
  const add = (label: RecommendationLabel, candidate: typeof candidates[number] | undefined) => {
    if (candidate) selected.push({ label, ...candidate });
  };
  add("Best Overall", candidates[0]);
  add("Best Credential Option", candidates.find(({ resource }) => resource.certificate && !selected.some((item) => item.resource.id === resource.id)));
  if (selected.length < 2) add("Best Free/Open Learning Path", candidates.find(({ resource }) => resource.costType === "free" && !selected.some((item) => item.resource.id === resource.id)));
  return selected;
}
