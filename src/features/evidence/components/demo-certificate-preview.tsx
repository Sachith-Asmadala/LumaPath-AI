import Image from "next/image";

const previews: Record<string, string> = {
  "https://example.org/lumapath-demo/certificates/git-release-automation": "/demo/certificates/git-release-automation.png",
  "https://example.org/lumapath-demo/certificates/docker-foundations": "/demo/certificates/docker-foundations.png",
};

export function DemoCertificatePreview({ sourceUrl, title }: { sourceUrl: string | null; title: string }) {
  const src = sourceUrl ? previews[sourceUrl] : undefined;
  if (!src) return null;
  return <a href={src} target="_blank" rel="noopener noreferrer" className="mt-3 block max-w-sm overflow-hidden rounded-xl border border-border transition-colors hover:border-primary/40">
    <Image src={src} alt={title} width={1536} height={1024} sizes="(max-width: 640px) 80vw, 384px" className="h-auto w-full" />
  </a>;
}
