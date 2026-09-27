"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return <Button variant="ghost" size="icon" className="size-10 rounded-full text-muted-foreground" aria-label="Toggle color theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="size-4 light:hidden" /><Moon className="hidden size-4 light:block" /></Button>;
}

export function PublicHeader({ simple = false }: { simple?: boolean }) {
  return <header className="public-header">
    <Link href="/" aria-label="LumaPath AI home" className="public-wordmark"><BrandLogo size="lg" decorative priority /></Link>
    {!simple && <nav aria-label="About LumaPath" className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"><Link href="/#how-it-works" className="public-nav-link">How it works</Link><Link href="/#made-for-you" className="public-nav-link">Made for you</Link></nav>}
    <div className="flex items-center gap-2 sm:gap-4"><ThemeToggle /><Link href={simple ? "/" : "/login"} className="public-nav-link py-3 text-sm">{simple ? "Back to home" : "Log in"}</Link>{!simple && <Button asChild className="hidden h-10 rounded-full px-5 text-xs sm:inline-flex"><Link href="/register">Get started</Link></Button>}</div>
  </header>;
}
