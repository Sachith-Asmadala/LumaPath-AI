import type { Metadata } from "next";

export const metadata: Metadata = { title: "Free learning path" };

export default function FreeLearningPathLayout({ children }: { children: React.ReactNode }) {
  return children;
}
