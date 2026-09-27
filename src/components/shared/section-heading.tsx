import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="type-eyebrow mb-2 text-muted-foreground">{eyebrow}</p>}
        <h2 className="type-section-title text-foreground">{title}</h2>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
