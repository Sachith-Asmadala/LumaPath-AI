import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { brand } from "@/lib/brand";
import { DemoProvider } from "@/lib/state/demo-provider";
import "@fontsource-variable/onest";
import "@fontsource-variable/red-hat-display";
import "./globals.css";

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
    { media: "(prefers-color-scheme: light)", color: "#f6f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#131316" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange><DemoProvider>{children}</DemoProvider></ThemeProvider></body>
    </html>
  );
}
