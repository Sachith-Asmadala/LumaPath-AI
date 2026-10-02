"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, Compass, Leaf, MoveUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { PublicHeader } from "@/components/public/public-header";
import { PathPreview } from "@/components/public/path-preview";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/components/brand/brand-icon";
import { useDemo } from "@/state/demo-provider";
import { nextStudentJourneyRoute } from "@/features/onboarding/domain/student-journey";

function ScrollReveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  // Keep server-rendered content visible before hydration; motion only enhances it.
  return <motion.div className={className} initial={false} whileInView={reduced ? { opacity: 1, y: 0 } : { opacity: [0.85, 1], y: [12, 0] }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

export function LandingPage() {
  const { state, onboardingReady } = useDemo();
  const returning = onboardingReady && state.onboarding.completed;
  const startHref = returning ? nextStudentJourneyRoute(state) : "/register";
  return <div className="public-site">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <PublicHeader />
    <main id="main-content">
      <section className="landing-hero" aria-labelledby="hero-title">
        <ScrollReveal className="hero-copy">
          <p className="public-eyebrow"><span className="size-1.5 rounded-full bg-primary" />A little clarity goes a long way</p>
          <h1 id="hero-title">Your next chapter.<br /><span className="editorial-italic">One clear step.</span></h1>
          <p className="hero-description">University, career goals, and everything in between. Find a rhythm that works for you, with a thoughtful plan for what comes next.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4"><Button asChild className="public-primary-button"><Link href={startHref}>{returning ? "Continue your journey" : "Find my path"}<ArrowUpRight className="size-4" /></Link></Button><Link href="#how-it-works" className="group inline-flex min-h-12 items-center gap-2 text-sm text-muted-foreground">Take a look around<ArrowDown className="size-3.5 transition-transform group-hover:translate-y-1 motion-reduce:transform-none" /></Link></div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><Check className="size-3.5 text-primary" />Your goals. Your pace. A path that adapts.</p>
        </ScrollReveal>
        <ScrollReveal className="hero-preview" delay={0.16}><PathPreview /></ScrollReveal>
      </section>
      <div className="landing-principles"><span>Built around the whole student</span><div><span><BookOpen />Academic life</span><span><Compass />Career direction</span><span><Leaf />Everyday capacity</span></div></div>
      <section id="how-it-works" className="landing-section" aria-labelledby="how-title">
        <ScrollReveal className="section-heading-row"><div><p className="public-eyebrow">Less guessing. More direction.</p><h2 id="how-title">Big ambitions.<br /><span className="editorial-italic">Smaller, clearer steps.</span></h2></div><p>You don’t need to figure it all out today.<br className="hidden sm:block" />Start where you are. Build from there.</p></ScrollReveal>
        <div className="journey-grid">{[
          { number: "01", title: "Start with you.", description: "Your modules, your goals, your learning style. A few small details help shape a path that feels like yours.", label: "Your starting point", icon: Compass, tone: "sage" },
          { number: "02", title: "Find your direction.", description: "See the skills you already have, the ones to build next, and a practical roadmap toward your chosen career.", label: "Your personal pathway", icon: MoveUpRight, tone: "clay" },
          { number: "03", title: "Make room to grow.", description: "Bring learning into your actual week, alongside deadlines and real life. Adjust the pace whenever you need to.", label: "Your everyday rhythm", icon: Leaf, tone: "lavender" },
        ].map(({ number, title, description, label, icon: Icon, tone }, index) => <ScrollReveal key={number} delay={index * 0.06} className={`journey-card journey-${tone}`}><div className="flex items-start justify-between"><span className="journey-number">{number}</span><Icon className="size-5 text-muted-foreground" strokeWidth={1.4} /></div><div className="journey-card-rule" /><h3>{title}</h3><p>{description}</p><span className="journey-card-label">{label}<ArrowUpRight className="size-3.5" /></span></ScrollReveal>)}</div>
      </section>
      <section id="made-for-you" className="landing-section life-section" aria-labelledby="life-title">
        <ScrollReveal className="life-illustration"><div className="life-sheet"><div className="flex items-center justify-between"><span className="public-eyebrow mb-0">A plan with breathing room</span><Leaf className="size-4 text-primary" /></div><div className="life-block"><span className="life-block-line" /><div><p>Finish the important thing.</p><span>Database assignment · 60 min</span></div><Check className="ml-auto size-4 text-primary" /></div><div className="life-block life-block-soft"><span className="life-block-line" /><div><p>Make a little progress.</p><span>Docker practice · 25 min</span></div></div><div className="life-open-space"><span className="editorial-italic">Space for everything else.</span><svg viewBox="0 0 240 30" aria-hidden="true"><path d="M5 18 Q65 0 120 18 T235 18" stroke="currentColor" fill="none" /></svg></div><p className="text-xs text-muted-foreground">Less available today? Your plan can adjust.</p></div><span className="life-margin-note editorial-italic">Life happens.<br />Your plan understands.</span></ScrollReveal>
        <ScrollReveal className="life-copy"><p className="public-eyebrow">Made for a real life</p><h2>Ambition needs<br /><span className="editorial-italic">a little breathing room.</span></h2><p>Some days you have more to give. Some days, less. LumaPath brings your time, energy, and responsibilities into the plan.</p><ul>{["Keep important deadlines in view", "Choose a lighter day when you need one", "Build skills without filling every spare minute"].map((item) => <li key={item}><Check className="size-4 text-primary" />{item}</li>)}</ul><Link href={startHref} className="public-text-link">Build a plan around you<ArrowRight className="size-4" /></Link></ScrollReveal>
      </section>
      <ScrollReveal className="landing-final"><div className="final-path" aria-hidden="true" /><BrandIcon size={62} decorative /><p className="public-eyebrow mt-4">Begin wherever you are</p><h2>Your future doesn’t need a perfect plan.<br /><span className="editorial-italic">Just a place to start.</span></h2><Button asChild className="public-primary-button mt-7"><Link href={startHref}>{returning ? "Continue your journey" : "Let’s find your path"}<ArrowUpRight className="size-4" /></Link></Button><p className="mt-4 text-xs text-muted-foreground">Explore the LumaPath student prototype.</p></ScrollReveal>
    </main>
    <footer className="public-footer"><span>LumaPath AI <span className="mx-2 text-border">/</span> A clearer way forward.</span><div className="flex items-center gap-6"><Link href="#how-it-works">How it works</Link><Link href="/login">Log in<ArrowUpRight className="ml-1 inline size-3" /></Link></div></footer>
  </div>;
}
