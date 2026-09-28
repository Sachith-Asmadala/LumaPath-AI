"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Native buttons keep every choice reachable with Tab, Enter, and Space. */
export function ViewSwitch<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string; count?: number }[]; onChange: (value: T) => void;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  return <div role="group" aria-label={label} className="workspace-switch">{options.map((option) => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn("relative isolate", value === option.value && "is-selected")}>
    {value === option.value && <motion.span layoutId={`switch-${id}`} className="workspace-switch-active" transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }} />}
    {option.label}{" "}{option.count !== undefined && <span className="ml-1.5 opacity-65 tabular-nums">{option.count}</span>}
  </button>)}</div>;
}

export function WorkspaceSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <label className="workspace-search"><Search className="size-4 shrink-0" aria-hidden="true" /><input type="search" aria-label={label} placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function EmptyCollection({ title, description, onReset }: { title: string; description: string; onReset?: () => void }) {
  return <div className="workspace-empty" role="status"><SlidersHorizontal className="mx-auto mb-4 size-5 text-primary" aria-hidden="true" /><h3 className="font-heading text-lg text-foreground">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{onReset && <button type="button" onClick={onReset} className="mt-4 min-h-11 rounded-lg px-4 text-sm font-medium text-primary underline underline-offset-4">Clear filters</button>}</div>;
}
