import type { Metadata } from "next";

export const metadata: Metadata = { title: "DevOps baseline assessment" };

export default function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
