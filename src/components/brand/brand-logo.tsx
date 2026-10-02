import Image from "next/image";
import { BrandIcon } from "@/components/brand/brand-icon";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: keyof typeof brand.logoWidths;
  variant?: "auto" | "light" | "dark";
  iconOnly?: boolean;
  className?: string;
  decorative?: boolean;
  priority?: boolean;
};

export function BrandLogo({ size = "md", variant = "auto", iconOnly = false, className, decorative = false, priority = false }: BrandLogoProps) {
  if (iconOnly) return <BrandIcon size={size === "sm" ? 24 : size === "lg" ? 40 : 32} className={className} decorative={decorative} priority={priority} />;

  const width = brand.logoWidths[size];
  const image = (src: string, themeClass?: string) => <Image src={src} alt={decorative ? "" : brand.name} aria-hidden={decorative || undefined} width={1448} height={1086} unoptimized priority={priority} className={cn("h-auto shrink-0 object-contain", themeClass, className)} style={{ width }} />;

  if (variant === "light") return image(brand.assets.logoLight);
  if (variant === "dark") return image(brand.assets.logoDark);

  // Both assets have the same dimensions. CSS chooses the visible one before hydration,
  // including when next-themes resolves the system preference.
  return <>
    {image(brand.assets.logoLight, "hidden light:block")}
    {image(brand.assets.logoDark, "block light:hidden")}
  </>;
}
