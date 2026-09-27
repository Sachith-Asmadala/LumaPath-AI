import Image from "next/image";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandIcon({ size = 32, className, decorative = false, priority = false }: { size?: number; className?: string; decorative?: boolean; priority?: boolean }) {
  return <Image src={brand.assets.icon} alt={decorative ? "" : brand.name} aria-hidden={decorative || undefined} width={1254} height={1254} priority={priority} className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size }} />;
}
