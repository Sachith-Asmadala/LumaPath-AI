"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Orbit, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function PremiumWelcome({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const key = `lumapath-plus-welcome-v1:${studentId}`;
  useEffect(() => {
    try {
      if (localStorage.getItem(key)) return;
    } catch { return; }
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [key]);

  function dismiss() {
    setOpen(false);
    try { localStorage.setItem(key, "seen"); } catch { /* A blocked browser store should never block entry. */ }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
    <DialogContent className="plus-welcome sm:max-w-[680px]">
      <div className="plus-welcome-art" aria-hidden="true"><div className="plus-orbit plus-orbit-one" /><div className="plus-orbit plus-orbit-two" /><div className="plus-orbit plus-orbit-three" /><span className="plus-art-icon"><Orbit size={44} strokeWidth={1} /></span><span className="plus-art-label">SMALL STEPS. BIG POSSIBILITIES.</span></div>
      <div className="plus-welcome-copy"><p className="plus-eyebrow"><Sparkles size={14} />INTRODUCING LUMAPATH PLUS</p><DialogTitle className="text-3xl leading-tight tracking-tight sm:text-4xl">Make room for<br />your next chapter.</DialogTitle><DialogDescription className="mt-3 leading-6">Meet the future of your workspace. More perspective, more personal guidance, and more ways to grow.</DialogDescription>
        <ul className="my-6 space-y-3 text-sm">{["Deeper learning and career insights", "More pathways to explore", "Progress that travels across devices"].map((item) => <li className="flex items-center gap-2.5" key={item}><Check size={16} className="text-primary" />{item}</li>)}</ul>
        <Button asChild className="h-12 w-full rounded-xl"><Link href="/plans" onClick={dismiss}>Explore Plus<ArrowRight size={16} /></Link></Button>
        <Button variant="ghost" onClick={dismiss} className="mt-2 h-11 w-full rounded-xl">Continue with Free</Button>
        <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">Plus is coming soon. Your current tools are free.<br />No payment details needed.</p>
      </div>
    </DialogContent>
  </Dialog>;
}
