import { Badge } from "@/components/ui/badge";
import type { EvidenceStatus, RiskLevel, SkillStatus, TaskCategory } from "@/lib/demo-data/types";

const riskStyles: Record<RiskLevel, string> = {
  critical: "border-risk/30 bg-risk/10 text-risk",
  high: "border-risk/25 bg-risk/10 text-risk",
  moderate: "border-warning/20 bg-warning/8 text-warning",
  low: "border-success/20 bg-success/8 text-success",
};

const skillStyles: Record<SkillStatus, string> = {
  verified: "border-success/20 bg-success/8 text-success",
  "in-progress": "border-primary/25 bg-primary/8 text-primary",
  available: "border-pathway/25 bg-pathway/8 text-pathway",
  locked: "border-border bg-muted/40 text-muted-foreground",
  gap: "border-warning/25 bg-warning/8 text-warning",
};

const categoryStyles: Record<TaskCategory, string> = {
  Academic: "border-primary/18 bg-primary/7 text-primary",
  Career: "border-pathway/20 bg-pathway/8 text-pathway",
  Personal: "border-border bg-muted text-muted-foreground",
  Internship: "border-success/20 bg-success/8 text-success",
  "AI Recommended": "border-primary/20 bg-primary/8 text-primary",
};

export function RiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.65rem] font-medium capitalize ${riskStyles[level]}`}>{label ?? level}</Badge>;
}

export function SkillBadge({ status }: { status: SkillStatus }) {
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.65rem] font-medium capitalize ${skillStyles[status]}`}>{status.replace("-", " ")}</Badge>;
}

export function CategoryBadge({ category }: { category: TaskCategory }) {
  return <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[0.62rem] font-medium ${categoryStyles[category]}`}>{category}</Badge>;
}

export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  const className = status === "verified" ? skillStyles.verified : status === "submitted" ? skillStyles["in-progress"] : status === "needs-review" ? skillStyles.gap : skillStyles.locked;
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.65rem] font-medium capitalize ${className}`}>{status.replaceAll("-", " ")}</Badge>;
}
