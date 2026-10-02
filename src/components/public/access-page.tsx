"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Eye, EyeOff, Leaf, LockKeyhole } from "lucide-react";
import { PublicHeader } from "@/components/public/public-header";
import { PathPreview } from "@/components/public/path-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemo } from "@/state/demo-provider";
import { nextStudentJourneyRoute } from "@/features/onboarding/domain/student-journey";

export function AccessPage({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const { state, onboardingReady, updateOnboarding } = useDemo();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  function enter(form?: HTMLFormElement) {
    if (!onboardingReady || pending) return;
    if (register && !state.onboarding.completed && form) {
      const name = String(new FormData(form).get("name") ?? "").trim();
      if (name) updateOnboarding({ name });
    }
    // Prototype access resumes the same local journey. Credentials are never persisted or sent.
    form?.reset();
    startTransition(() => router.push(nextStudentJourneyRoute(state)));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    enter(event.currentTarget);
  }

  return <div className="public-site access-site">
    <PublicHeader simple />
    <main className="access-layout">
      <motion.aside className="access-story" initial={{ opacity: 0, x: reduced ? 0 : -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0.01 : 0.65 }} aria-label="A clearer way forward"><div><p className="public-eyebrow"><Leaf className="size-3.5" />A clearer way forward</p><h2>There’s a path<br /><span className="editorial-italic">with your name on it.</span></h2><p>A little structure for today.<br />A little confidence for what’s next.</p></div><PathPreview compact /><span className="access-story-footer">Made for your studies, your ambitions, and your life.</span></motion.aside>
      <motion.section className="access-form-panel" initial={{ opacity: 0, y: reduced ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0.01 : 0.55, delay: reduced ? 0 : 0.1 }} aria-labelledby="access-title">
        <div className="access-form-wrap"><p className="public-eyebrow">{register ? "Your next chapter starts here" : "A familiar place to begin"}</p><h1 id="access-title">{register ? "Make room for" : "Welcome"}<br /><span className="editorial-italic">{register ? "what’s next." : "back."}</span></h1><p className="mb-8 mt-4 text-sm leading-6 text-muted-foreground">{register ? "Tell us a little about yourself, then let’s find your starting point." : "Pick up where you left off. Your next step is waiting."}</p>
          <div className="access-demo-note"><LockKeyhole className="size-3.5 shrink-0" /><p>Prototype access. Use sample details; your email and password are never saved or sent.</p></div>
          <form onSubmit={submit} className="mt-6 space-y-5">
            {register && <div><label htmlFor="access-name" className="access-label">Your name</label><Input id="access-name" name="name" autoComplete="name" required minLength={2} placeholder="Alex Morgan" className="access-input" /></div>}
            <div><label htmlFor="access-email" className="access-label">Email address</label><Input id="access-email" name="email" type="email" autoComplete="email" required placeholder="you@university.edu" className="access-input" /></div>
            <div><label htmlFor="access-password" className="access-label">Password</label><div className="relative"><Input id="access-password" name="password" type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} minLength={8} required placeholder="At least 8 characters" className="access-input pr-12" /><button type="button" className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
            <Button type="submit" className="public-primary-button w-full" disabled={!onboardingReady || pending}>{pending ? "Opening your path…" : register ? "Start my journey" : "Continue to LumaPath"}<ArrowRight className="ml-auto size-4" /></Button>
          </form>
          <div className="access-divider"><span />or explore first<span /></div>
          <Button variant="outline" onClick={() => enter()} disabled={!onboardingReady || pending} className="h-12 w-full gap-2 rounded-xl border-border bg-transparent text-sm">Continue without an account<ArrowUpRight className="size-4" /></Button>
          <p className="mt-7 text-center text-sm text-muted-foreground">{register ? "Already finding your rhythm?" : "New to LumaPath?"} <Link className="font-medium text-primary underline-offset-4 hover:underline" href={register ? "/login" : "/register"}>{register ? "Log in" : "Start your journey"}</Link></p>
        </div>
      </motion.section>
    </main>
    <footer className="access-footer">A little clarity. A little momentum. Your own way forward.</footer>
  </div>;
}
