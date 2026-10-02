"use client";

import { ThemeProvider } from "next-themes";
import { useDemo } from "@/state/demo-provider";
import { useSubscription } from "./subscription-provider";
import { hasProFeatures } from "../entitlements";

export function PlanThemeProvider({ children }: { children: React.ReactNode }) {
  const { subscription } = useSubscription();
  const { state, signedOut } = useDemo();
  const allowDark = !signedOut && subscription?.subject_id === state.student.id && hasProFeatures(subscription?.plan);
  return <ThemeProvider attribute="class" defaultTheme="light" forcedTheme={allowDark ? undefined : "light"} enableSystem={allowDark} disableTransitionOnChange>{children}</ThemeProvider>;
}
