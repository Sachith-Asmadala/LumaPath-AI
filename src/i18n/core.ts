import en from "@/i18n/locales/en.json";
import si from "@/i18n/locales/si-LK.json";
import ta from "@/i18n/locales/ta-LK.json";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/config";

export type MessageDictionary = Record<string, string>;
const resources: Record<SupportedLocale, MessageDictionary> = { en, "si-LK": si, "ta-LK": ta };

function interpolate(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

export function translate(locale: SupportedLocale, key: string, values?: Record<string, string | number>, fallback?: string) {
  const selected = resources[locale]?.[key];
  const english = resources[DEFAULT_LOCALE][key];
  const message = selected ?? english ?? fallback ?? resources[DEFAULT_LOCALE]["common.translationUnavailable"] ?? "Translation unavailable";
  return interpolate(message, values);
}

export function hasTranslation(locale: SupportedLocale, key: string) {
  return Boolean(resources[locale]?.[key]);
}

export function allMessageKeys() {
  return Object.keys(resources.en);
}

export function pseudoLocalize(message: string) {
  const map: Record<string, string> = { a: "á", e: "ë", i: "ï", o: "ô", u: "ü", A: "Á", E: "Ë", I: "Ï", O: "Ô", U: "Ü" };
  return `［${message.split(/(\{[^{}]+\})/g).map(part => part.startsWith("{") ? part : part.replace(/[aeiouAEIOU]/g, (char) => map[char] ?? char)).join("")}～～］`;
}

function normalizeFormatDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function formatLocaleDate(locale: SupportedLocale, value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options ?? { year: "numeric", month: "short", day: "numeric" }).format(normalizeFormatDate(value));
}

export function formatLocaleTime(locale: SupportedLocale, value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options ?? { hour: "numeric", minute: "2-digit" }).format(normalizeFormatDate(value));
}

export function formatLocaleNumber(locale: SupportedLocale, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options).format(value);
}
