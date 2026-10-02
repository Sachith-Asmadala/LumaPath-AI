"use client";

import { Accessibility, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useSubscription } from "@/features/subscriptions/components/subscription-provider";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/state/demo-provider";
import { cn } from "@/lib/utils";
import { localeOptions } from "@/i18n/config";
import { useLocale } from "@/i18n/locale-provider";
import { NotificationPreferencesCard } from "@/features/notifications/components/notification-preferences-card";

export default function SettingsPage() {
  const { subscription } = useSubscription();
  const { state, resetDemo, learningAction } = useDemo();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const settings = [
    { title: t("settings.studentContext"), detail: t("settings.studentContextDetail", { name: state.student.name, role: state.student.targetRole }), icon: UserRound },
    { title: t("settings.demoCalculations"), detail: t("settings.demoCalculationsDetail"), icon: ShieldCheck },
    { title: t("settings.motionPreference"), detail: t("settings.motionPreferenceDetail"), icon: Accessibility },
  ];
  return <div className="mx-auto w-full max-w-[900px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8"><div className="mb-6"><p className="type-eyebrow mb-2 text-muted-foreground">{t("settings.eyebrow")}</p><TypographyH1>{t("settings.title")}</TypographyH1><TypographyP className="mt-2">{t("settings.subtitle")}</TypographyP></div><div className="space-y-3">
    <Card className="rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5">
      <h2 className="text-[0.76rem] font-medium text-foreground">{t("settings.languageTitle")}</h2>
      <p className="mt-1 text-[0.66rem] leading-5 text-muted-foreground">{t("settings.languageDescription")}</p>
      <div role="radiogroup" aria-label={t("settings.languageTitle")} className="mt-4 grid gap-2 sm:grid-cols-3">
        {localeOptions.map((option) => <button key={option.code} type="button" role="radio" aria-checked={locale === option.code} onClick={() => setLocale(option.code)} className={cn("min-h-12 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", locale === option.code ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:bg-accent")}>
          <span className="block text-sm font-medium">{option.nativeLabel}</span><span className="mt-0.5 block text-[0.65rem] text-muted-foreground">{option.label}{locale === option.code ? ` · ${t("common.selected")}` : ""}</span>
        </button>)}
      </div>
      <p className="mt-3 text-[0.65rem] leading-5 text-muted-foreground">{t("settings.languageFallback")}</p>
    </Card>
    <Card className="rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><h2 className="text-[0.76rem] font-medium text-foreground">{t("settings.appearance")}</h2><p className="mt-1 text-[0.66rem] leading-5 text-muted-foreground">{t("settings.appearanceDescription")}</p><div role="group" aria-label={t("settings.themeLabel")} className="mt-4 grid grid-cols-3 gap-3">{(["system", "light", "dark"] as const).map((option) => <button key={option} type="button" onClick={() => setTheme(option)} aria-pressed={mounted && theme === option} className={cn("min-w-0 rounded-xl border p-2 text-xs capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mounted && theme === option ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:bg-accent")}><span className="theme-preview" data-theme={option} aria-hidden="true"><span /><span /></span><span className="block py-3">{t(`settings.theme.${option}`)}{mounted && theme === option ? ` · ${t("common.selected")}` : ""}</span></button>)}</div></Card>
    <NotificationPreferencesCard />
    {settings.map(({ title, detail, icon: Icon }) => <Card key={title} className="flex items-start gap-3 rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-border/75 bg-background/55 text-primary"><Icon className="size-4" /></span><div><h2 className="text-[0.76rem] font-medium text-foreground">{title}</h2><p className="mt-1 text-[0.66rem] leading-5 text-muted-foreground">{detail}</p></div></Card>)}
    <Card className="rounded-2xl border-border bg-surface-raised p-5 shadow-none"><h2 className="text-sm font-medium">{t("settings.localData")}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">{t("settings.localDataDescription")}</p><Button variant="outline" className="mt-3 min-h-11" disabled={!state.capacity.lifeLoadNote && !Object.keys(state.capacity.lifeLoadFactors ?? {}).length} onClick={() => learningAction({ type: "clear-life-load" })}>{t("settings.clearPrivate")}</Button><p className="mt-2 text-xs text-muted-foreground">{t("settings.clearPrivateHint")}</p></Card>
    <Card className="rounded-2xl border-border bg-surface-raised p-5 shadow-none"><h2 className="text-sm font-medium">{subscription?.name ?? "My subscription"}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Compare Free, Pro and Institution, and review your current allowances.</p><Button asChild variant="outline" className="mt-3 min-h-11"><Link href="/settings/subscription">{t("settings.viewPlans")}</Link></Button></Card>
    <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><div><h2 className="text-sm font-medium text-foreground">{t("settings.resetTitle")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("settings.resetDescription")}</p></div><Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => { resetDemo(); router.replace("/onboarding"); }}><RotateCcw className="size-4" aria-hidden="true" />{t("settings.resetTitle")}</Button></Card>
    <Card className="flex items-center gap-3 rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><div className="relative h-14 w-[155px] shrink-0 overflow-hidden"><BrandLogo size="md" className="absolute top-1/2 left-0 -translate-y-1/2" /></div><p className="text-[0.66rem] leading-5 text-muted-foreground">{t("settings.brandTagline")}</p></Card>
  </div></div>;
}
