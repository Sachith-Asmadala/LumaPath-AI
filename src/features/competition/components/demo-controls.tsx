"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowRight, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/state/demo-provider";
import { useSubscription } from "@/features/subscriptions/components/subscription-provider";

export function StartCompetitionDemo({ reset = false }: { reset?: boolean }) {
  const { startCompetitionDemo, onboardingReady } = useDemo();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          const response = await fetch("/api/competition-demo/status", { cache: "no-store", signal: AbortSignal.timeout(5000) });
          if (response.ok) { if (!cancelled) setEnabled(true); return; }
        } catch { /* Development compilation or an API restart can briefly interrupt availability. */ }
        if (attempt < 3) await new Promise(resolve => window.setTimeout(resolve, 1000));
      }
      if (!cancelled) setError("Competition demo is unavailable. Start the development API, then reload this page.");
    })();
    return () => { cancelled = true; };
  }, []);
  if (process.env.NODE_ENV === "production") return null;
  async function start() {
    setBusy(true); setError("");
    try { await startCompetitionDemo(); router.replace("/overview?competition=1"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The demo could not be started. Please retry."); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0"><Button variant="outline" className="rounded-xl" disabled={busy || !enabled || !onboardingReady} onClick={() => void start()}>{reset ? <RotateCcw size={14}/> : <Play size={14}/>}{busy ? "Restoring scenario…" : reset ? "Reset demo" : "Start Competition Demo"}</Button>{error && <p role="alert" className="mt-2 max-w-sm text-xs text-destructive">{error}</p>}</div>;
}

export function CompetitionDemoBar() {
  const { state } = useDemo(); const pathname = usePathname();
  const { subscription, loading } = useSubscription();
  if (!state.competition) return null;
  return <aside className="competition-demo-bar" aria-label="Competition demo navigation"><span><strong>Competition Demo • Synthetic Data</strong><small>Oct 5, 2026 · {subscription?.name ?? (loading ? "Loading plan…" : "Plan unavailable")}</small></span><nav aria-label="Two-minute demo path">{[{href:"/overview",title:"Overview"},{href:"/opportunities?competition=1",title:"Opportunity"},{href:"/career-compare",title:"Career Compare"}].map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href.split("?")[0]?"page":undefined}>{item.title}<ArrowRight size={12}/></Link>)}</nav><StartCompetitionDemo reset /></aside>;
}
