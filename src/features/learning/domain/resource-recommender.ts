import { learningResources, type LearningResource, type ResourceContentType, type ResourceLevel, type ResourceProvider } from "@/data/demo/resources";
import type { CareerSkill, OnboardingState } from "@/data/demo/types";

export type RecommendationLabel = "Best Overall" | "Best Credential Option" | "Best Free/Open Learning Path";
export type CostFilter = "any" | "free" | "paid";

export interface ResourceFilters {
  query?: string;
  contentTypes?: readonly ResourceContentType[];
  providers?: readonly ResourceProvider[];
  levels?: readonly ResourceLevel[];
  cost?: CostFilter;
  certificateOnly?: boolean;
  maxDurationHours?: number;
}

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

export function matchesResourceFilters(resource: LearningResource, filters: ResourceFilters = {}): boolean {
  const query = filters.query?.trim().toLowerCase();
  if (query) {
    const haystack = [resource.title, resource.provider, resource.skill, resource.contentType, resource.level, ...resource.tags].join(" ").toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (filters.contentTypes?.length && !filters.contentTypes.includes(resource.contentType)) return false;
  if (filters.providers?.length && !filters.providers.includes(resource.provider)) return false;
  if (filters.levels?.length && !filters.levels.includes(resource.level)) return false;
  if (filters.cost === "free" && resource.costType !== "free") return false;
  if (filters.cost === "paid" && resource.costType === "free") return false;
  if (filters.certificateOnly && !resource.certificate) return false;
  if (filters.maxDurationHours && resource.durationHours > filters.maxDurationHours) return false;
  return true;
}

function resourceMatch(resource: LearningResource, skill: Pick<CareerSkill, "name" | "proficiency">, preferences: OnboardingState) {
  const level = levelFromScore(skill.proficiency);
  const hours = Math.max(1, preferences.weeklyLearningHours);
  const preferredFormat = preferences.preferredLearning.includes(resource.format);
  const certificatePreferred = preferences.certificatePreference ? preferences.certificatePreference !== "not important" : preferences.goal === "certification";
  const exactLevel = resource.level === level;
  const free = resource.costType === "free";
  const shortStudy = resource.durationHours <= hours * 2;
  const qualityBoost = Math.round(resource.qualityScore * 0.12);
  const matchScore = Math.min(100, 10
    + (exactLevel ? 18 : 9)
    + (preferredFormat ? 15 : 4)
    + Math.round(resource.handsOnScore * 0.10)
    + qualityBoost
    + (certificatePreferred ? (resource.certificate ? Math.round(resource.credentialScore * 0.13) : 0) : resource.certificate ? 4 : 0)
    + (shortStudy ? 11 : 5)
    + (free ? 9 : 5));

  const reasons = [
    exactLevel ? `Matches your current ${skill.name} level (${level}).` : `Offers a nearby level for your ${level} starting point.`,
    `Fits ${hours} hours/week in about ${Math.ceil(resource.durationHours / hours)} ${Math.ceil(resource.durationHours / hours) === 1 ? "week" : "weeks"}.`,
  ];
  if (preferredFormat) reasons.push(`Uses your preferred ${resource.format} format.`);
  if (resource.contentType === "video") reasons.push("Video-first resource for visual learning and quick review.");
  if (resource.contentType === "notes") reasons.push("Concise notes/reference material for revision.");
  if (resource.qualityScore >= 90) reasons.push("High-trust source in the prototype catalog.");
  if (resource.handsOnScore >= 75) reasons.push("Includes hands-on practice.");
  reasons.push(free ? "Free/open learning within your budget." : "Within your selected demo budget.");
  if (resource.certificate) reasons.push("Certificate available.");
  reasons.push(`Available in ${resource.language}.`);
  return { resource, matchScore, reasons };
}

export function rankLearningResources(
  skill: Pick<CareerSkill, "id" | "name" | "proficiency">,
  preferences: OnboardingState,
  catalog: readonly LearningResource[] = learningResources,
  filters: ResourceFilters = {},
) {
  const currentLevel = levelFromScore(skill.proficiency);
  const hours = Math.max(1, preferences.weeklyLearningHours);
  return catalog.filter((resource) =>
    resource.skill === skill.id
    && resource.language.trim().toLowerCase() === preferences.language.trim().toLowerCase()
    && isWithinBudget(resource, preferences.budget)
    && (preferences.certificatePreference !== "required" || resource.certificate)
    && resource.durationHours <= hours * 4
    && Math.abs(levels.indexOf(resource.level) - levels.indexOf(currentLevel)) <= 1
    && matchesResourceFilters(resource, filters),
  ).map((resource) => resourceMatch(resource, skill, preferences))
    .sort((a, b) => b.matchScore - a.matchScore || b.resource.qualityScore - a.resource.qualityScore || a.resource.id.localeCompare(b.resource.id));
}

export function recommendLearningResources(
  skill: Pick<CareerSkill, "id" | "name" | "proficiency">,
  preferences: OnboardingState,
  catalog: readonly LearningResource[] = learningResources,
  filters: ResourceFilters = {},
): ResourceRecommendation[] {
  const candidates = rankLearningResources(skill, preferences, catalog, filters);
  const selected: ResourceRecommendation[] = [];
  const add = (label: RecommendationLabel, candidate: typeof candidates[number] | undefined) => {
    if (candidate) selected.push({ label, ...candidate });
  };
  add("Best Overall", candidates[0]);
  add("Best Credential Option", candidates.find(({ resource }) => resource.certificate && !selected.some((item) => item.resource.id === resource.id)));
  if (selected.length < 2) add("Best Free/Open Learning Path", candidates.find(({ resource }) => resource.costType === "free" && !selected.some((item) => item.resource.id === resource.id)));
  return selected;
}
