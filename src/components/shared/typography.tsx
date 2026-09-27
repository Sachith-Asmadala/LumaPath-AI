import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

function TypographyH1({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement> & { children: ReactNode }) {
  return <h1 className={cn("type-page-title text-foreground", className)} {...props}>{children}</h1>;
}

function TypographyH2({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement> & { children: ReactNode }) {
  return <h2 className={cn("type-section-title text-foreground", className)} {...props}>{children}</h2>;
}

function TypographyP({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement> & { children: ReactNode }) {
  return <p className={cn("text-sm leading-6 text-muted-foreground", className)} {...props}>{children}</p>;
}

function TypographyEyebrow({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement> & { children: ReactNode }) {
  return <p className={cn("type-eyebrow text-muted-foreground", className)} {...props}>{children}</p>;
}

export { TypographyH1, TypographyH2, TypographyP, TypographyEyebrow };
