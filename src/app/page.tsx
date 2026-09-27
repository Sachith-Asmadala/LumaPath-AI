import type { Metadata } from "next";
import { LandingPage } from "@/components/public/landing-page";

export const metadata: Metadata = {
  title: "Your next chapter, one clear step | LumaPath AI",
  description: "Find a thoughtful path through university, career learning, and everyday life. Plan your next step with LumaPath AI.",
};

export default function HomePage() {
  return <LandingPage />;
}
