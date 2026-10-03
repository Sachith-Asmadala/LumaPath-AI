import type { Metadata, Viewport } from "next";
import { PlanThemeProvider } from "@/features/subscriptions/components/plan-theme-provider";
import { SubscriptionProvider } from "@/features/subscriptions/components/subscription-provider";
import { brand } from "@/config/brand";
import { DemoProvider } from "@/state/demo-provider";
import { LocaleProvider } from "@/i18n/locale-provider";
import "@fontsource-variable/onest";
import "@fontsource-variable/red-hat-display";
import "./globals.css";
import "./public.css";
import "./workspace.css";
import "./ambient.css";
import "./pro.css";

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s | ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: brand.name,
    description: brand.description,
    siteName: brand.name,
    type: "website",
  },
  twitter: { card: "summary", title: brand.name, description: brand.description },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#090909" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Extensions such as Grammarly add body attributes before hydration. Suppression is limited to this element. */}
      <body suppressHydrationWarning><DemoProvider><SubscriptionProvider><PlanThemeProvider><LocaleProvider>{children}</LocaleProvider></PlanThemeProvider></SubscriptionProvider></DemoProvider></body>
    </html>
  );
}
