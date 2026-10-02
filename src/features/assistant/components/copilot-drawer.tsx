"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { contextualReply } from "@/features/assistant/domain/contextual-reply";
import { useDemo } from "@/state/demo-provider";
import { localeOptions, useLocale } from "@/i18n";

const suggestions = [
  { key: "copilot.s1", query: "Why this priority?" },
  { key: "copilot.s2", query: "Rebuild my week" },
  { key: "copilot.s3", query: "Explain my skill gaps" },
  { key: "copilot.s4", query: "What should I study tonight?" },
  { key: "copilot.s5", query: "Why did this task move?" },
  { key: "copilot.s6", query: "How career-ready am I?" },
] as const;

export function CopilotDrawer({ open, onOpenChange, route }: { open: boolean; onOpenChange: (open: boolean) => void; route: string }) {
  const { state } = useDemo();
  const { locale, t } = useLocale();
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [showReply, setShowReply] = useState(false);
  const reduceMotion = useReducedMotion();
  const reply = question ? contextualReply(question, route, state) : "I’m connected to your current context for this page. Ask about a priority, your planner, career skills, or current readiness.";
  const languageName = localeOptions.find((item) => item.code === locale)?.nativeLabel ?? locale;
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
            <div><SheetTitle className="text-sm font-semibold text-foreground">{t("copilot.ask")}</SheetTitle><SheetDescription className="mt-1 text-[0.68rem]">{t("copilot.guide")}</SheetDescription></div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[0.63rem] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />{t("copilot.contextExplanation")}</p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!question && <div className="space-y-4"><p className="text-xs font-medium text-muted-foreground">{t("copilot.suggested", { context: route === "/overview" ? t("copilot.yourDay") : route.replace("/", "").replaceAll("-", " ") })}</p><div className="flex flex-col gap-2">{suggestions.map((item) => <button key={item.key} type="button" onClick={() => prompt(item.query)} className="rounded-[14px] border border-border/75 bg-white/[0.025] px-3.5 py-3 text-left text-xs text-foreground/85 transition-colors hover:border-primary/20 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t(item.key)}<span className="mt-1 block text-[0.64rem] text-muted-foreground">{route.startsWith("/career") ? t("copilot.careerContext") : route.startsWith("/planner") ? t("copilot.scheduleContext") : t("copilot.priorityContext")}</span></button>)}</div></div>}
          {question && <div className="space-y-5">
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="ml-8 rounded-2xl border border-border bg-white/[0.035] px-3.5 py-3 text-xs leading-5 text-foreground">{question}</motion.div>
            <AnimatePresence mode="wait"><motion.div key={question} initial={{ opacity: 0, y: 5 }} animate={{ opacity: showReply ? 1 : 0.5, y: 0 }} transition={{ duration: reduceMotion ? 0.12 : 0.22 }} className="mr-5 rounded-2xl border border-primary/10 bg-primary/[0.035] px-3.5 py-3.5 text-xs leading-6 text-foreground/90"><span className="mb-2 flex items-center gap-2 text-[0.64rem] font-medium text-primary"><Sparkles className="size-3" />{t("copilot.decisionExplanation")}</span>{locale !== "en" && <span role="status" className="mb-2 block rounded-lg border border-warning/20 bg-warning/5 px-2.5 py-2 text-[0.6rem] leading-5 text-muted-foreground">{t("copilot.localeFallback", { language: languageName })}</span>}{reply}</motion.div></AnimatePresence>
          </div>}
        </div>
        <form onSubmit={submit} className="border-t border-border/80 p-4">
          <div className="flex items-center gap-2 rounded-[15px] border border-border bg-background/80 p-1.5 pl-3 transition-colors focus-within:border-primary/35">
            <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("copilot.placeholder")} aria-label={t("copilot.ask")} className="h-9 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0" />
            <Button type="submit" size="icon-sm" className="size-8 rounded-[10px]" disabled={!draft.trim()} aria-label={t("copilot.send")}><ArrowUp className="size-4" /></Button>
          </div>
          <p className="mt-2 px-1 text-[0.6rem] text-muted-foreground">{t("copilot.ruleNote")}</p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
