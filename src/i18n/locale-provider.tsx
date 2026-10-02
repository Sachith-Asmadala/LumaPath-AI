"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_STORAGE_KEY, TRANSLATION_VERSION, type SupportedLocale } from "@/i18n/config";
import { formatLocaleDate, formatLocaleNumber, formatLocaleTime, hasTranslation, translate } from "@/i18n/core";
import { useDemo } from "@/state/demo-provider";

type Values = Record<string, string | number>;
interface LocaleContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, values?: Values, fallback?: string) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  translationVersion: string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { state } = useDemo();
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const [announcement, setAnnouncement] = useState("");
  const changedByUser = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  useEffect(() => {
    if (!state.student.id) return;
    changedByUser.current = false;
    const controller = new AbortController();
    fetch("/api/profile/locale", { headers: { "X-Luma-Student-Id": state.student.id }, signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (isSupportedLocale(body?.locale) && !changedByUser.current) {
          // The profile preference is authoritative once the student identity is known.
          // localStorage is only the fast startup/offline cache.
          setLocaleState(body.locale);
          window.localStorage.setItem(LOCALE_STORAGE_KEY, body.locale);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [state.student.id]);

  const reportMissing = useCallback((key: string) => {
    if (!state.student.id) return;
    void fetch("/api/profile/translation-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Luma-Student-Id": state.student.id },
      body: JSON.stringify({ locale, key, translation_version: TRANSLATION_VERSION }),
    }).catch(() => undefined);
  }, [locale, state.student.id]);

  const t = useCallback((key: string, values?: Values, fallback?: string) => {
    if (!hasTranslation(locale, key)) queueMicrotask(() => reportMissing(key));
    return translate(locale, key, values, fallback);
  }, [locale, reportMissing]);

  const setLocale = useCallback((next: SupportedLocale) => {
    changedByUser.current = true;
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    setAnnouncement(translate(next, "settings.languageSaved"));
    if (!state.student.id) return;
    void fetch("/api/profile/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Luma-Student-Id": state.student.id },
      body: JSON.stringify({ locale: next, translation_version: TRANSLATION_VERSION }),
    }).catch(() => undefined);
  }, [state.student.id]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t,
    translationVersion: TRANSLATION_VERSION,
    formatDate: (input, options) => formatLocaleDate(locale, input, options),
    formatTime: (input, options) => formatLocaleTime(locale, input, options),
    formatNumber: (number, options) => formatLocaleNumber(locale, number, options),
  }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}<span className="sr-only" role="status" aria-live="polite">{announcement}</span></LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider.");
  return context;
}
