"use client";

import { memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const ease = [0.16, 1, 0.3, 1] as const;

export function AnimatedCard({ children, className, delay = 0, as = "div", hover = true, staggered = false }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "article" | "section"; hover?: boolean; staggered?: boolean }) {
  const reduced = useReducedMotion();
  const Tag = as === "article" ? motion.article : as === "section" ? motion.section : motion.div;
  const hidden = { opacity: 0, y: reduced ? 0 : 10 };
  const visible = { opacity: 1, y: 0 };
  return <Tag className={className} variants={staggered ? { hidden, visible } : undefined} initial={staggered ? undefined : hidden} animate={staggered ? undefined : visible} whileHover={hover && !reduced ? { y: -2 } : undefined} transition={{ duration: reduced ? 0.01 : 0.4, delay: staggered || reduced ? 0 : delay, ease }}>{children}</Tag>;
}

export function StaggerContainer({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const mobile = useIsMobile();
  return <motion.div className={className} initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: reduced || mobile ? 0 : 0.045 } } }}>{children}</motion.div>;
}

type MotionButtonProps = Omit<ComponentProps<typeof Button>, "asChild" | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration">;
export function MotionButton({ className, variant = "default", size = "default", ...props }: MotionButtonProps) {
  const reduced = useReducedMotion();
  return <motion.button data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }), "transition-colors duration-200 motion-reduce:transition-none")} whileHover={reduced || props.disabled ? undefined : { y: -2 }} whileTap={reduced || props.disabled ? undefined : { scale: 0.985 }} transition={{ duration: reduced ? 0.01 : 0.18, ease }} {...props} />;
}

export function StatusPulse({ trigger, children, className }: { trigger: string | number; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <span className={cn("relative inline-grid shrink-0 place-items-center", className)}>
    <motion.span key={trigger} className="pointer-events-none absolute inset-0 rounded-full border border-primary/50" initial={{ opacity: reduced ? 0 : 0.55, scale: reduced ? 1 : 0.85 }} animate={{ opacity: 0, scale: reduced ? 1 : 1.3 }} transition={{ duration: reduced ? 0.01 : 0.32, ease }} aria-hidden="true" />
    {children}
  </span>;
}

export function Reveal({ children, className, delay = 0, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" }) {
  const Tag = as === "section" ? motion.section : motion.div;
  const reduceMotion = useReducedMotion();
  return (
    <Tag
      className={className}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.16 : 0.32, delay: reduceMotion ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Tag>
  );
}

export const AnimatedProgress = memo(function AnimatedProgress({ value, className, indicatorClassName, delay = 0 }: { value: number; className?: string; indicatorClassName?: string; delay?: number }) {
  return (
    <Progress
      value={value}
      className={cn("h-1.5 overflow-hidden bg-muted", className)}
      indicatorClassName={cn("bg-primary transition-transform duration-[280ms] [transition-delay:var(--progress-delay)] motion-reduce:transition-none motion-reduce:delay-0", indicatorClassName)}
      style={{ "--progress-delay": `${delay}ms` } as React.CSSProperties}
      aria-label={`Progress ${value}%`}
    />
  );
});

export const AnimatedCounter = memo(function AnimatedCounter({ value, suffix = "", className, animateOnMount = false }: { value: number; suffix?: string; className?: string; animateOnMount?: boolean }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(animateOnMount ? 0 : value);
  const current = useRef(display);
  useEffect(() => {
    if (reduceMotion) {
      current.current = value;
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const initial = current.current;
    const duration = 340;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const precision = Number.isInteger(value) ? 1 : 10;
      current.current = Math.round((initial + (value - initial) * eased) * precision) / precision;
      setDisplay(current.current);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value, reduceMotion]);
  return <span className={className}>{display}{suffix}</span>;
});

export function ScoreRing({ value, size = 132, stroke = 8, className, animateOnMount = false }: { value: number; size?: number; stroke?: number; className?: string; animateOnMount?: boolean }) {
  const reduceMotion = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Career readiness ${value} percent`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--primary)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - value / 100) }}
          transition={{ duration: reduceMotion ? 0.01 : 0.35, ease }}
        />
      </svg>
      <div className="relative text-center">
        <div className="font-mono text-[2rem] font-medium tracking-[-0.08em] text-foreground"><AnimatedCounter value={value} animateOnMount={animateOnMount} /><span className="text-lg text-primary">%</span></div>
        <div className="type-eyebrow mt-1 text-muted-foreground">Readiness</div>
      </div>
    </div>
  );
}
