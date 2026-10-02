import type { LifeLoadFactor, LifeLoadImpact, StudentCapacity } from "@/data/demo/types";

export const lifeLoadFactorOptions: readonly LifeLoadFactor[] = [
  "Academic pressure", "Family responsibilities", "Relationship pressure", "Financial pressure",
  "Work / internship", "Health / low energy", "Social commitments", "Other",
];

export const lifeLoadImpacts: readonly LifeLoadImpact[] = ["Low", "Medium", "High"];

const bufferMinutes: Record<LifeLoadImpact, number> = { Low: 15, Medium: 30, High: 45 };

/** A deterministic planning buffer, never a health or wellbeing score. */
export function planningCapacityMinutes(capacity: StudentCapacity): number {
  const lifeLoadBuffer = Object.values(capacity.lifeLoadFactors ?? {}).reduce<number>((minutes, impact) => minutes + (impact ? bufferMinutes[impact] : 0), 0);
  return Math.max(0, capacity.availableMinutes - capacity.unexpectedCommitmentMinutes - lifeLoadBuffer);
}

export function hasLifeLoadFactors(capacity: StudentCapacity): boolean {
  return Object.keys(capacity.lifeLoadFactors ?? {}).length > 0;
}

export function hasHighLifeLoad(capacity: StudentCapacity): boolean {
  return Object.values(capacity.lifeLoadFactors ?? {}).some((impact) => impact === "High");
}
