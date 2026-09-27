"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";

function TransitionPage({ reduceMotion, children }: { reduceMotion: boolean; children: React.ReactNode }) {
  const present = useIsPresent();
  return <motion.div
    className="workspace-page"
    aria-hidden={!present}
    inert={!present}
    initial={{ opacity: 0, y: reduceMotion ? 0 : 9 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: reduceMotion ? 0 : -2 }}
    transition={{ duration: reduceMotion ? (present ? 0.08 : 0.04) : present ? 0.38 : 0.12, ease: [0.22, 1, 0.36, 1] }}
  >{children}</motion.div>;
}

export function PageTransition({ pathname, reduceMotion, children }: { pathname: string; reduceMotion: boolean; children: React.ReactNode }) {
  return <AnimatePresence mode="wait" initial={false}><TransitionPage key={pathname} reduceMotion={reduceMotion}>{children}</TransitionPage></AnimatePresence>;
}
