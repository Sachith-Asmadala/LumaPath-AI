import { BrandLogo } from "@/components/brand/brand-logo";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading LumaPath AI" className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="brand-loading-logo relative h-20 w-[210px] overflow-hidden">
        <BrandLogo size="lg" decorative priority className="absolute top-1/2 left-0 -translate-y-1/2" />
      </div>
    </div>
  );
}
