"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { contextualReply } from "@/lib/domain/contextual-reply";
import { useDemo } from "@/lib/state/demo-provider";

const suggestions = ["Why this priority?", "Rebuild my week", "Explain my skill gaps", "What should I study tonight?", "Why did this task move?", "How career-ready am I?"];

export function CopilotDrawer({ open, onOpenChange, route }: { open: boolean; onOpenChange: (open: boolean) => void; route: string }) {
  const { state } = useDemo();
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [showReply, setShowReply] = useState(false);
  const reduceMotion = useReducedMotion();
  const reply = question ? contextualReply(question, route, state) : "I’m connected to your current context for this page. Ask about a priority, your planner, career skills, or current readiness.";
  const prompt = (text: string) => {
    setQuestion(text);
    setShowReply(false);
    window.setTimeout(() => setShowReply(true), reduceMotion ? 80 : 260);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    prompt(draft.trim());
    setDraft("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-border bg-surface-inset p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b border-border/80 px-5 py-5 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><Sparkles className="size-4" aria-hidden="true" /></span>
            <div><SheetTitle className="text-sm font-semibold text-foreground">Ask Luma</SheetTitle><SheetDescription className="mt-1 text-[0.68rem]">A guide to your current student context</SheetDescription></div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[0.63rem] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />Context explanation · local scenario</p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!question && <div className="space-y-4"><p className="text-xs font-medium text-muted-foreground">Suggested for {route === "/overview" ? "your day" : route.replace("/", "").replaceAll("-", " ")}</p><div className="flex flex-col gap-2">{suggestions.map((text) => <button key={text} type="button" onClick={() => prompt(text)} className="rounded-[14px] border border-border/75 bg-white/[0.025] px-3.5 py-3 text-left text-xs text-foreground/85 transition-colors hover:border-primary/20 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{text}<span className="mt-1 block text-[0.64rem] text-muted-foreground">{route.startsWith("/career") ? "Career pathway context" : route.startsWith("/planner") ? "Schedule and capacity context" : "Current priorities and student goals"}</span></button>)}</div></div>}
          {question && <div className="space-y-5">
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="ml-8 rounded-2xl border border-border bg-white/[0.035] px-3.5 py-3 text-xs leading-5 text-foreground">{question}</motion.div>
            <AnimatePresence mode="wait"><motion.div key={question} initial={{ opacity: 0, y: 5 }} animate={{ opacity: showReply ? 1 : 0.5, y: 0 }} transition={{ duration: reduceMotion ? 0.12 : 0.22 }} className="mr-5 rounded-2xl border border-primary/10 bg-primary/[0.035] px-3.5 py-3.5 text-xs leading-6 text-foreground/90"><span className="mb-2 flex items-center gap-2 text-[0.64rem] font-medium text-primary"><Sparkles className="size-3" />Luma · decision explanation</span>{reply}</motion.div></AnimatePresence>
          </div>}
        </div>
        <form onSubmit={submit} className="border-t border-border/80 p-4">
          <div className="flex items-center gap-2 rounded-[15px] border border-border bg-background/80 p-1.5 pl-3 transition-colors focus-within:border-primary/35">
            <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your priorities…" aria-label="Ask Luma a question" className="h-9 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0" />
            <Button type="submit" size="icon-sm" className="size-8 rounded-[10px]" disabled={!draft.trim()} aria-label="Send question"><ArrowUp className="size-4" /></Button>
          </div>
          <p className="mt-2 px-1 text-[0.6rem] text-muted-foreground">Rules calculate priorities. Luma explains your local state; no external AI is used.</p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
