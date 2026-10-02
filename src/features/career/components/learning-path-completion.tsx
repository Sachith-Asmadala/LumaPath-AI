"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { selectLearningPathCompletion } from "@/features/career/domain/skill-reassessment";
import { useDemo } from "@/state/demo-provider";

export function LearningPathCompletionCard({ skillId }: { skillId: string }) {
  const { state } = useDemo();
  const completion = selectLearningPathCompletion(state, skillId);
  if (!completion?.pathComplete) return null;
  const skill = state.careerSkills.find((item) => item.id === skillId);
  const result = state.skillReassessments[skillId];
  const items = [
    { label: "Course/Resources", complete: completion.courseComplete },
    { label: "Practice", complete: completion.practiceComplete },
    { label: "Project Evidence", complete: completion.projectComplete },
    { label: "Assessment", complete: Boolean(result?.passed) },
  ];

  return <Card className="rounded-2xl border-success/25 bg-success/[0.045] p-5 sm:p-6" aria-label={`${skill?.name ?? "Skill"} learning path completion`}>
    <p className="type-eyebrow mb-2 text-success">Learning milestone</p>
    <h2 className="font-heading text-xl font-semibold text-foreground">{skill?.name ?? "Skill"} Learning Path Completed</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Your study and practice steps are complete. Check your evidence and take the short skill assessment.</p>
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item) => <li key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-sm"><span className="text-foreground">{item.label}</span><span className={`inline-flex items-center gap-1.5 ${item.complete ? "text-success" : "text-muted-foreground"}`}>{item.complete ? <CheckCircle2 className="size-4" aria-label="Completed" /> : <Circle className="size-4" aria-hidden="true" />}{item.complete ? "Done" : item.label === "Assessment" && result ? "Retry" : "Pending"}</span></li>)}</ul>
    {result?.passed ? <Button asChild className="mt-5 h-11 rounded-xl px-5 text-sm"><Link href={`/career-path/${skillId}/verify`}>View Verification Result</Link></Button>
      : <Button asChild className="mt-5 h-11 rounded-xl px-5 text-sm font-semibold"><Link href={`/career-path/${skillId}/verify`}>Verify My Skill</Link></Button>}
  </Card>;
}
