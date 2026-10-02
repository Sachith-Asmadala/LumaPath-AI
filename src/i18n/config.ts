export const TRANSLATION_VERSION = "2026-10-02.10";
export const SUPPORTED_LOCALES = ["en", "si-LK", "ta-LK"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const localeOptions: readonly { code: SupportedLocale; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "si-LK", label: "Sinhala", nativeLabel: "සිංහල" },
  { code: "ta-LK", label: "Tamil", nativeLabel: "தமிழ்" },
];

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LOCALE_STORAGE_KEY = "lumapath.locale.v1";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
