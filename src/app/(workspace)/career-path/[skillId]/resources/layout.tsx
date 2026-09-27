import type { Metadata } from "next";

export const metadata: Metadata = { title: "Learning resources" };

export default function LearningResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
