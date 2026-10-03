"use client";

import { Download, FileText } from "lucide-react";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";
import { Button } from "@/components/ui/button";

const files = {
  cv: [
    { key: "demoFiles.starterCv", href: "/demo/cvs/devops-starter.pdf" },
    { key: "demoFiles.internshipCv", href: "/demo/cvs/devops-internship.pdf" },
  ],
  learning: [
    { key: "demoFiles.linux", href: "/demo/learning/linux-foundations.pdf" },
    { key: "demoFiles.docker", href: "/demo/learning/docker-networking-lab.pdf" },
    { key: "demoFiles.cicd", href: "/demo/learning/cicd-release-guide.pdf" },
  ],
  calendar: [{ key: "demoFiles.timetable", href: "/demo/university-calendar.ics" }],
} as const;

export function DemoFiles({ kind }: { kind: keyof typeof files }) {
  const { state } = useDemo();
  const { t } = useLocale();
  if (!state.competition && state.student.id !== "student-sachith") return null;
  return <aside className="mb-5 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4" aria-label={t("demoFiles.title")}>
    <p className="flex items-center gap-2 text-sm font-medium"><FileText className="size-4 text-primary" aria-hidden="true" />{t("demoFiles.title")}</p>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(`demoFiles.${kind}Description`)}</p>
    <div className="mt-3 flex flex-wrap gap-2">{files[kind].map(file => <Button key={file.href} asChild variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left text-xs">
      <a href={file.href} download><Download className="size-3.5 shrink-0" aria-hidden="true" />{t(file.key)}</a>
    </Button>)}</div>
  </aside>;
}
