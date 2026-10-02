import type { DemoState } from "@/data/demo/types";
import { planningCapacityMinutes } from "@/features/capacity/domain/life-load";

/** Local explanations; private check-in notes are never quoted or transmitted. */
export function contextualReply(question: string, route: string, state: DemoState): string {
  const query = question.toLowerCase();
  if (/suicid|self.harm|kill myself|hurt myself|end my life|immediate danger|not safe right now/.test(query)) {
    return "Your safety matters. If you are in immediate danger or might hurt yourself, contact local emergency services now or go to the nearest emergency department. Reach out to someone you trust who can stay with you. LumaPath cannot provide crisis care; please seek immediate human support.";
  }
  if (/career.ready|readiness/.test(query)) return state.assessment && state.student.id === "student-onboarded"
    ? `Your readiness is ${state.readiness.score}%. It combines assessment performance (40%), completed skill coverage (25%), submitted projects (20%), and completed learning tasks (15%). Project links and learning completion are learner-reported; external certificates do not automatically add points. Continue your roadmap to improve the remaining areas.`
    : `The sample student scenario has ${state.readiness.score}% readiness. Complete your own baseline assessment to get a score based on your learning state.`;
  if (/skill|study|learn/.test(query) || route.startsWith("/career-path") || route.startsWith("/skills")) {
    const next = state.careerSkills.find((skill) => skill.status === "in-progress") ?? state.careerSkills.find((skill) => skill.status === "available");
    return next ? `${next.name} is your next available learning step at ${next.proficiency}%. Its prerequisites are satisfied, and it fits your ${state.student.targetRole} pathway. You have selected ${state.onboarding.weeklyLearningHours} learning hours per week. Open its roadmap node to review the target, prerequisites, and resources.` : "No skill is currently available. Open your roadmap to review completed skills and the prerequisites for remaining steps.";
  }
  if (/week|move|capacity|pressure|overwhelm|stress|workload/.test(query) || route.startsWith("/planner")) {
    const moved = state.planBlocks.filter((block) => block.previousStartAt && block.previousStartAt !== block.startAt).length;
    return `Your adjusted planning capacity is ${planningCapacityMinutes(state.capacity)} minutes today. ${moved} schedule blocks have moved. ${state.activeAction.rationale} You can preview a lighter plan from Life Load Check-In; changes need your choice. This explanation does not change your schedule.`;
  }
  return `${state.activeAction.title}: ${state.activeAction.rationale} Open “Why this?” to review the priority factors. These explanations use your local tasks, deadlines, capacity, and pathway state.`;
}
