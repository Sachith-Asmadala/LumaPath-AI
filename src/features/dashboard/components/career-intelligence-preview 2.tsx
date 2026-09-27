"use client";

import Link from "next/link";
import { Bookmark, CalendarPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/state/demo-provider";

export function CareerIntelligencePreview() {
  const { state, addIntelligenceItemToPlan, setFeedStatus, addOpportunityPreparation } = useDemo();
  const dockerVerified = state.careerSkills.some((skill) => skill.id === "docker" && skill.status === "verified");
  const preferred = dockerVerified ? "container-release" : "kubernetes-fundamentals";
  const item = state.intelligenceItems.find((item) => item.id === preferred && !["dismissed", "not-relevant"].includes(item.status)) ?? state.intelligenceItems.find((item) => !["dismissed", "not-relevant"].includes(item.status));
  const opportunity = state.opportunities[0];
  const prepared = state.tasks.some((task) => task.id === "prep-aws-internship");
  return <section aria-label="Career Intelligence" className="space-y-3">
    <div className="flex items-center justify-between"><h2 className="type-section-title">Career Intelligence</h2><Link href="/intelligence" className="text-xs text-muted-foreground hover:text-primary">Explore all →</Link></div>
    <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
      {item && <Card className="gap-3 rounded-2xl border-border/85 bg-surface-raised p-4 shadow-none"><p className="type-eyebrow text-pathway">Learning update · {item.durationMinutes} min</p><h3 className="text-sm font-medium">{item.title}</h3><p className="text-xs leading-5 text-muted-foreground"><span className="text-foreground">Why this matters: </span>{item.whyRelevant}</p><div className="mt-auto flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={item.status === "saved" || item.status === "planned"} onClick={() => setFeedStatus(item.id, "saved")}><Bookmark className="size-3" />{item.status === "saved" ? "Saved" : "Save"}</Button><Button size="sm" disabled={item.status === "planned"} onClick={() => addIntelligenceItemToPlan(item.id)}><CalendarPlus className="size-3" />{item.status === "planned" ? "Added to Plan" : "Add to Plan"}</Button></div></Card>}
      {opportunity && <Card className="gap-3 rounded-2xl border-border/85 bg-surface-raised p-4 shadow-none"><div className="flex justify-between gap-2"><p className="type-eyebrow text-pathway">Opportunity preview</p><span className="text-xs text-success">{opportunity.match}% Match</span></div><h3 className="text-sm font-medium">{opportunity.role}</h3><p className="text-xs text-muted-foreground">{opportunity.organization} · Closes {new Date(`${opportunity.closesAt}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p><p className="text-xs text-muted-foreground"><span className="text-success">Strengths: </span>{opportunity.strengths.join(" · ")}<br /><span className="text-warning">Build next: </span>{opportunity.missingSkills.join(" · ")}</p><Button size="sm" variant="outline" className="mt-auto w-fit" disabled={prepared} onClick={addOpportunityPreparation}>{prepared ? "Preparation planned" : "Prepare"}</Button></Card>}
    </div>
  </section>;
}
