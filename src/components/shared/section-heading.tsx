import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow && <p className="type-eyebrow mb-2 text-muted-foreground">{eyebrow}</p>}
        <h2 className="type-section-title text-foreground">{title}</h2>
      </div>
      {aside && <div className="max-w-full">{aside}</div>}
    </div>
  );
}
