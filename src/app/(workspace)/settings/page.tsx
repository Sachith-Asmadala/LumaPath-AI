"use client";
import { StudentAvatar } from "@/components/shared/student-avatar";

import { Accessibility, ArrowUpRight, Bell, Check, Globe2, GraduationCap, LockKeyhole, LogOut, Monitor, Moon, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useSubscription } from "@/features/subscriptions/components/subscription-provider";
import { hasProFeatures } from "@/features/subscriptions/entitlements";
import { BrandIcon } from "@/components/brand/brand-icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/state/demo-provider";
import { cn } from "@/lib/utils";
import { releaseLabel } from "@/lib/release";
import { localeOptions } from "@/i18n/config";
import { useLocale } from "@/i18n/locale-provider";
import { NotificationPreferencesCard } from "@/features/notifications/components/notification-preferences-card";
import { ProControls } from "@/features/subscriptions/components/pro-controls";
import styles from "./settings.module.css";

const themes = [{ id: "light", icon: Sun }, { id: "dark", icon: Moon }, { id: "system", icon: Monitor }] as const;

export default function SettingsPage() {
  const { subscription, loading } = useSubscription();
  const { state, resetDemo, learningAction, signOut } = useDemo();
  const router = useRouter();
  const { theme, forcedTheme, setTheme } = useTheme();
  const allowDark = hasProFeatures(subscription?.plan);
  const activeTheme = forcedTheme ?? theme;
  const { locale, setLocale, t } = useLocale();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const links = [
    { id: "settings-account", label: t("settings.account"), icon: UserRound },
    { id: "settings-appearance", label: t("settings.appearance"), icon: SlidersHorizontal },
    { id: "settings-notifications", label: t("settings.notifications"), icon: Bell },
    { id: "settings-privacy", label: t("settings.localData"), icon: LockKeyhole },
  ];

  return <div className={styles.page}>
    <header className={styles.heading}>
      <div><p className="type-eyebrow mb-2 text-primary">{t("settings.eyebrow")}</p><TypographyH1>{t("settings.title")}</TypographyH1><TypographyP className="mt-2">{t("settings.subtitle")}</TypographyP></div>
      <span className={styles.headingIcon} aria-hidden="true"><SlidersHorizontal size={25} strokeWidth={1.5} /></span>
    </header>

    <nav className={styles.sectionNav} aria-label={t("settings.title")}>{links.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`}><Icon size={15} aria-hidden="true" />{label}</a>)}</nav>

    <section id="settings-account" aria-label={t("settings.account")} className={styles.account}>
      <Card className={styles.profile}>
        <div className={styles.profileMain}>
          <StudentAvatar student={state.student} className={styles.avatar} />
          <div className={styles.profileCopy}><p className={styles.eyebrow}>{t("settings.studentContext")}</p><h2>{state.student.name}</h2><p>{state.student.targetRole}</p>{state.onboarding.university && <p className={styles.university}><GraduationCap size={15} aria-hidden="true" />{state.onboarding.university}</p>}</div>
        </div>
        <div className={styles.accountFooter}><p>{t("settings.signOutDescription")}</p><Button type="button" variant="outline" className="h-11 shrink-0 gap-2 rounded-xl" onClick={() => { signOut(); router.replace("/login"); }}><LogOut size={15} aria-hidden="true" />{t("settings.signOut")}</Button></div>
      </Card>
      <Card className={styles.membership}>
        <span className={styles.sectionIcon}><Sparkles size={20} aria-hidden="true" /></span>
        <p className={styles.eyebrow}>{t("settings.membership")}</p>
        <h2>{loading ? t("common.loading") : subscription?.name ?? t("settings.planUnavailable")}</h2>
        <p className={styles.description}>{t("settings.membershipDescription")}</p>
        <Button asChild variant="outline" className="mt-auto h-11 w-full justify-between rounded-xl"><Link href="/settings/subscription">{t("settings.viewPlans")}<ArrowUpRight size={16} aria-hidden="true" /></Link></Button>
      </Card>
    </section>

    <div className={styles.preferences}>
      <section id="settings-appearance" aria-labelledby="appearance-title" className={styles.appearance}>
        <Card className={styles.panel}>
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><SlidersHorizontal size={18} aria-hidden="true" /></span><div><h2 id="appearance-title">{t("settings.appearance")}</h2><p>{t("settings.appearanceDescription")}</p></div></div>
          <div role="group" aria-label={t("settings.themeLabel")} className={styles.themeGrid}>
            {themes.map(({ id, icon: Icon }) => <button key={id} type="button" disabled={id !== "light" && !allowDark} onClick={() => setTheme(id)} aria-pressed={mounted && activeTheme === id} aria-label={`${t(`settings.theme.${id}`)}${id !== "light" && !allowDark ? " · Included with Pro" : ""}`} className={cn(styles.themeOption, "disabled:cursor-not-allowed disabled:opacity-60", mounted && activeTheme === id && styles.selected)}>
              <span className="theme-preview" data-theme={id} aria-hidden="true"><span /><span><i /><i /><i /></span></span>
              <span className={styles.themeLabel}><Icon size={14} aria-hidden="true" /><span>{t(`settings.theme.${id}`)}</span><span className={styles.selectionDot} aria-hidden="true">{id !== "light" && !allowDark ? <LockKeyhole size={12} /> : mounted && activeTheme === id && <Check size={12} />}</span></span>
            </button>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{allowDark ? "Pro includes light, dark, and system appearance." : <>Free includes light appearance. Dark and system appearance are included with Pro. <Link href="/checkout" className="font-medium text-primary underline underline-offset-4">Upgrade to Pro</Link></>}</p>
          <div className={styles.motionNote}><Accessibility size={17} aria-hidden="true" /><p>{t("settings.motionPreferenceDetail")}</p></div>
        </Card>
      </section>
      <section aria-labelledby="language-title">
        <Card className={styles.panel}>
          <div className={styles.sectionHeading}><span className={styles.sectionIcon}><Globe2 size={18} aria-hidden="true" /></span><div><h2 id="language-title">{t("settings.languageTitle")}</h2><p>{t("settings.languageDescription")}</p></div></div>
          <div role="radiogroup" aria-label={t("settings.languageTitle")} className={styles.languages}>
            {localeOptions.map((option) => <button key={option.code} type="button" role="radio" aria-checked={locale === option.code} onClick={() => setLocale(option.code)} className={cn(styles.languageOption, locale === option.code && styles.selected)}>
              <span><strong>{option.nativeLabel}</strong><small>{option.label}</small></span><span className={styles.selectionDot} aria-hidden="true">{locale === option.code && <Check size={12} />}</span>
            </button>)}
          </div>
          <p className={styles.hint}>{t("settings.languageFallback")}</p>
        </Card>
      </section>
    </div>

    <ProControls />

    <section id="settings-notifications" aria-label={t("settings.notifications")} className={styles.notifications}><NotificationPreferencesCard /></section>

    <section id="settings-privacy" aria-labelledby="privacy-title" className={styles.privacy}>
      <Card className={styles.panel}>
        <div className={styles.sectionHeading}><span className={styles.sectionIcon}><LockKeyhole size={18} aria-hidden="true" /></span><div><h2 id="privacy-title">{t("settings.localData")}</h2><p>{t("settings.localDataDescription")}</p></div></div>
        <Button variant="outline" className="min-h-11 w-fit max-w-full whitespace-normal rounded-xl" disabled={!state.capacity.lifeLoadNote && !Object.keys(state.capacity.lifeLoadFactors ?? {}).length} onClick={() => learningAction({ type: "clear-life-load" })}>{t("settings.clearPrivate")}</Button>
        <p className={styles.hint}>{t("settings.clearPrivateHint")}</p>
        <div className={styles.infoNote}><ShieldCheck size={17} aria-hidden="true" /><div><h3>{t("settings.demoCalculations")}</h3><p>{t("settings.demoCalculationsDetail")}</p></div></div>
      </Card>
      <Card className={cn(styles.panel, styles.reset)}>
        <div className={styles.sectionHeading}><span className={styles.sectionIcon}><RotateCcw size={18} aria-hidden="true" /></span><div><h2>{t("settings.resetTitle")}</h2><p>{t("settings.resetDescription")}</p></div></div>
        <Button type="button" variant="outline" className="mt-auto h-11 w-fit gap-2 rounded-xl" onClick={() => { resetDemo(); router.replace("/onboarding"); }}><RotateCcw size={15} aria-hidden="true" />{t("settings.resetTitle")}</Button>
      </Card>
    </section>

    <footer className={styles.footer}><div><BrandIcon size={26} decorative /><p>{t("settings.brandTagline")}</p></div><span>{releaseLabel}</span></footer>
  </div>;
}
