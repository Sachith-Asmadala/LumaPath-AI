"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, Clock3, Leaf, Sparkles } from "lucide-react";

const previews = [
  { label: "Your day", caption: "A little structure. A lot more space.", title: "One good next step.", tag: "Today, with intention", items: [{ time: "09:00", title: "Make room for the important", detail: "Database assignment · 60 min", done: true }, { time: "11:00", title: "Build something real", detail: "Docker practice · 45 min", done: false }, { time: "14:00", title: "Leave a little breathing room", detail: "An open afternoon", done: false }] },
  { label: "Your direction", caption: "Small milestones. Meaningful progress.", title: "A future taking shape.", tag: "Your DevOps pathway", items: [{ time: "01", title: "A strong foundation", detail: "Linux & Git · verified", done: true }, { time: "02", title: "Your next milestone", detail: "Docker · learn, build, verify", done: false }, { time: "03", title: "A new door opens", detail: "CI/CD · next on your pathway", done: false }] },
  { label: "Your pace", caption: "A plan that makes room for life.", title: "Progress, on your terms.", tag: "A lighter kind of day", items: [{ time: "01", title: "Protect what matters", detail: "Your closest academic deadline", done: true }, { time: "02", title: "Make the next step smaller", detail: "A focused 25-minute session", done: false }, { time: "03", title: "Save some things for later", detail: "Career learning can wait a day", done: false }] },
];

export function PathPreview({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState(0);
  const reduced = useReducedMotion();
  const preview = previews[selected];
  return <div className={`path-preview ${compact ? "path-preview-compact" : ""}`}>
    <div className="preview-orbit" aria-hidden="true"><svg viewBox="0 0 600 600" fill="none"><motion.path d="M60 430C-20 230 200 40 380 92C590 150 590 450 370 512C230 550 190 460 280 330C370 200 520 310 498 410" stroke="currentColor" strokeWidth="1" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 2.2, ease: "easeInOut" }} /></svg></div>
    <motion.div className="preview-note" initial={{ opacity: 0, y: reduced ? 0 : 12, rotate: reduced ? 0 : -4 }} animate={{ opacity: 1, y: 0, rotate: reduced ? 0 : -3 }} transition={{ delay: reduced ? 0 : 0.4, duration: 0.6 }}><Leaf className="size-4" /><span>A little more clarity.</span></motion.div>
    <div className="preview-paper">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-5"><span className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">A glimpse of your path</span><span className="flex shrink-0 items-center gap-1.5 text-[0.65rem] text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />Sample day</span></div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={selected} initial={{ opacity: 0, x: reduced ? 0 : 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0.01 : 0.25 }}>
        <p className="mb-2 mt-7 text-xs text-primary">{preview.tag}</p><h2 className="font-display text-[1.8rem] font-medium leading-tight tracking-[-0.045em] sm:text-[2.15rem]">{preview.title}</h2>
        <div className="preview-timeline">{preview.items.map((item, index) => <div key={item.title} className="preview-timeline-row"><span className="preview-time">{item.time}</span><span className={`preview-point ${index === 1 ? "preview-point-active" : ""}`}>{item.done ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}</span><div><p className="text-sm font-medium leading-5">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p></div></div>)}</div>
        <div className="flex items-center gap-2 rounded-xl bg-primary/[0.065] px-3.5 py-3 text-xs text-primary"><Sparkles className="size-3.5 shrink-0" />{preview.caption}<ArrowUpRight className="ml-auto size-3.5 shrink-0" /></div>
      </motion.div></AnimatePresence>
    </div>
    <div className="preview-bottom-note"><Clock3 className="size-3.5" /><span>Room to learn. Room to live.</span></div>
    {!compact && <div role="group" aria-label="Explore the LumaPath preview" className="preview-switcher">{previews.map((item, index) => <button type="button" key={item.label} aria-pressed={selected === index} onClick={() => setSelected(index)} className="relative min-h-11 rounded-full px-4 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{selected === index && <motion.span layoutId={reduced ? undefined : "preview-tab"} className="absolute inset-0 rounded-full border border-border bg-card shadow-sm" transition={{ type: "spring", stiffness: 320, damping: 32 }} />}<span className={`relative ${selected === index ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span></button>)}</div>}
  </div>;
}
