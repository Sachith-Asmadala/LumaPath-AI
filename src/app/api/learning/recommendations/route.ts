import { NextResponse } from "next/server";
import { rankLearningResources, recommendLearningResources, type ResourceFilters } from "@/features/learning/domain/resource-recommender";
import type { CareerSkill, OnboardingState } from "@/data/demo/types";

type Payload = {
  skill?: Pick<CareerSkill, "id" | "name" | "proficiency">;
  preferences?: OnboardingState;
  filters?: ResourceFilters;
};

function validSkill(skill: Payload["skill"]): skill is NonNullable<Payload["skill"]> {
  return Boolean(skill && typeof skill.id === "string" && typeof skill.name === "string" && Number.isFinite(skill.proficiency));
}

function validPreferences(preferences: Payload["preferences"]): preferences is OnboardingState {
  return Boolean(preferences
    && typeof preferences.language === "string"
    && Number.isFinite(preferences.weeklyLearningHours)
    && Array.isArray(preferences.preferredLearning)
    && typeof preferences.budget === "string");
}

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = await request.json() as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!validSkill(payload.skill) || !validPreferences(payload.preferences)) {
    return NextResponse.json({ error: "A valid skill and onboarding preferences are required." }, { status: 422 });
  }
  const filters = payload.filters ?? {};
  const recommendations = rankLearningResources(payload.skill, payload.preferences, undefined, filters);
  const highlights = recommendLearningResources(payload.skill, payload.preferences, undefined, filters);
  return NextResponse.json({ recommendations, highlights, count: recommendations.length }, { status: 200 });
}
