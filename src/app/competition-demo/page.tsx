import { BrandLogo } from "@/components/brand/brand-logo";
import { Card } from "@/components/ui/card";
import { StartCompetitionDemo } from "@/features/competition/components/demo-controls";
export default function CompetitionDemoPage() {
  return <main className="workspace-shell grid min-h-dvh place-items-center bg-background p-6"><Card className="w-full max-w-xl gap-5 rounded-3xl p-7 sm:p-10"><BrandLogo /><p className="workspace-eyebrow">TWO MINUTES. ONE CONNECTED JOURNEY.</p><h1 className="font-heading text-3xl font-semibold tracking-tight">From today’s priority<br/>to tomorrow’s opportunity.</h1><p className="text-sm leading-6 text-muted-foreground">Meet Sachith, a Computer Science student preparing for a DevOps internship. Restore the synthetic scenario, then follow the Overview, Opportunity and Career Compare path.</p><StartCompetitionDemo /><p className="text-xs text-muted-foreground">Development demonstration only. Uses synthetic records and a fixed scenario date.</p></Card></main>;
}
