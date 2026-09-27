"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loading from "./loading";
import { useDemo } from "@/lib/state/demo-provider";

export default function HomePage() {
  const router = useRouter();
  const { state, onboardingReady } = useDemo();

  useEffect(() => {
    if (onboardingReady) router.replace(state.onboarding.completed ? "/overview" : "/onboarding");
  }, [onboardingReady, router, state.onboarding.completed]);

  return <Loading />;
}
