"use client";

import { motion } from "motion/react";

export function PageTransition({ pathname, reduceMotion, children }: { pathname: string; reduceMotion: boolean; children: React.ReactNode }) {
  // App Router replaces its children during navigation. Mount the new page
  // immediately so an outgoing animation cannot retain stale router content.
  return <motion.div
    key={pathname}
    className="workspace-page"
    initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
  >{children}</motion.div>;
}
