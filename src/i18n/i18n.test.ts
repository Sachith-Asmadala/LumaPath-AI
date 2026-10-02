import { describe, expect, it } from "vitest";
import { allMessageKeys, formatLocaleDate, formatLocaleNumber, formatLocaleTime, pseudoLocalize, translate } from "@/i18n/core";
import { SUPPORTED_LOCALES } from "@/i18n/config";

describe("internationalisation resources", () => {
  it("resolves representative navigation text in all supported locales", () => {
    expect(translate("en", "nav.tasks")).toBe("Tasks");
    expect(translate("si-LK", "nav.tasks")).toBe("කාර්යයන්");
    expect(translate("ta-LK", "nav.tasks")).toBe("பணிகள்");
  });

  it("falls back to English without exposing missing raw identifiers", () => {
    expect(translate("si-LK", "nav.overview")).not.toBe("nav.overview");
    expect(translate("ta-LK", "missing.key")).not.toBe("missing.key");
  });

  it("preserves placeholders and pseudo-localises visible text", () => {
    const value = pseudoLocalize("Continue {count}");
    expect(value).toContain("{count}");
    expect(value.length).toBeGreaterThan("Continue {count}".length);
  });

  it("formats dates, times and numbers through the selected locale", () => {
    const value = "2026-10-04T14:30:00+05:30";
    for (const locale of SUPPORTED_LOCALES) {
      expect(formatLocaleDate(locale, value, { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Colombo" })).toBeTruthy();
      expect(formatLocaleTime(locale, value, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Colombo" })).toBeTruthy();
      expect(formatLocaleNumber(locale, 12345.6)).toBeTruthy();
    }
  });

  it("keeps a non-empty stable English catalogue", () => {
    expect(allMessageKeys().length).toBeGreaterThan(100);
    expect(SUPPORTED_LOCALES).toEqual(["en", "si-LK", "ta-LK"]);
  });
});
