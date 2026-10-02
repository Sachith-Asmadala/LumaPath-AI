import type { SkillEvidence } from "@/data/demo/types";

const trustBonus: Record<SkillEvidence["status"], number> = {
  verified: 2,
  submitted: 1,
  "self-reported": -1,
  "needs-review": 0,
  expired: -3,
};

/** Deterministic demo confidence combines observed scores with evidence maturity. */
export function calculateEvidenceConfidence(items: SkillEvidence[]): number {
  if (items.length === 0) return 0;
  const scoreMean = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
  const trustSignal = items.reduce((sum, item) => sum + trustBonus[item.status], 0);
  return Math.min(99, Math.max(0, Math.round(scoreMean + trustSignal)));
}

export function describeEvidenceConfidence(items: SkillEvidence[]): string {
  const verified = items.filter((item) => item.status === "verified").length;
  const total = items.length;
  return `${verified} of ${total} evidence items verified; status maturity adds a small transparent confidence signal.`;
}
