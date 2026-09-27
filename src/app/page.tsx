"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loading from "./loading";
import { useDemo } from "@/lib/state/demo-provider";
import { nextStudentJourneyRoute } from "@/lib/domain/student-journey";

export default function HomePage() {
  const router = useRouter();
  const { state, onboardingReady } = useDemo();

  useEffect(() => {
    if (onboardingReady) router.replace(nextStudentJourneyRoute(state));
  }, [onboardingReady, router, state]);

  return <Loading />;
}
