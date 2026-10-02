"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loading from "@/app/loading";
import { WorkspaceShell } from "@/components/layout/navigation";
import { useDemo } from "@/state/demo-provider";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { state, onboardingReady } = useDemo();
  useEffect(() => {
    if (onboardingReady && !state.onboarding.completed) router.replace("/onboarding");
  }, [onboardingReady, state.onboarding.completed, router]);
  if (!onboardingReady || !state.onboarding.completed) return <Loading />;
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
