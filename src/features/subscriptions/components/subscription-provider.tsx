"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDemo } from "@/state/demo-provider";
import { apiErrorMessage, isPlanError, planErrorMessage, type PlanError, type PlanId, type Subscription } from "../entitlements";

const Context = createContext<{ subscription: Subscription | null; loading: boolean; error: string; refresh: () => Promise<void>; switchDemoPlan: (plan: PlanId) => Promise<void> } | null>(null);
export function useSubscription() { const context = useContext(Context); if (!context) throw new Error("SubscriptionProvider is required."); return context; }

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { state } = useDemo();
  const requestVersion = useRef(0);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState<PlanError | null>(null);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const response = await fetch("/api/subscriptions/me", { headers: { "X-Luma-Student-Id": state.student.id }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(body, "Plan details could not be loaded."));
      if (body.subject_id !== state.student.id || !["free", "pro", "institution"].includes(body.plan) || !body.entitlements) throw new Error("Plan details could not be verified.");
      if (version === requestVersion.current) { setSubscription(body); setError(""); }
    } catch (cause) { if (version === requestVersion.current) { setError(cause instanceof Error ? cause.message : "Plan details could not be loaded."); setSubscription(null); } }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [state.student.id]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const handle = (event: Event) => { const detail = (event as CustomEvent).detail; if (isPlanError(detail)) { setUpgrade(detail); void refresh(); } };
    const reset = () => { void refresh(); };
    window.addEventListener("lumapath:competition-reset", reset);
    window.addEventListener("lumapath:plan-required", handle);
    return () => { window.removeEventListener("lumapath:plan-required", handle); window.removeEventListener("lumapath:competition-reset", reset); };
  }, [refresh]);
  const switchDemoPlan = async (plan: PlanId) => {
    const response = await fetch("/api/subscriptions/demo-plan", { method: "POST", headers: { "X-Luma-Student-Id": state.student.id, "Content-Type": "application/json" }, body: JSON.stringify({ plan }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const body = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(body, "The demo plan could not be changed."));
    ++requestVersion.current;
    setSubscription(body); setUpgrade(null); setError(""); setLoading(false);
  };
  return <Context.Provider value={{ subscription, loading, error, refresh, switchDemoPlan }}>{children}<Dialog open={Boolean(upgrade)} onOpenChange={(open) => { if (!open) setUpgrade(null); }}><DialogContent className="rounded-2xl sm:max-w-md"><Sparkles className="size-6 text-primary" /><DialogTitle>{upgrade?.required_plan === "institution" ? "Built for institutions" : upgrade?.upgrade_required === false ? "Your plan allowance" : "More room with LumaPath Pro"}</DialogTitle><DialogDescription className="leading-6">{upgrade && planErrorMessage(upgrade)}</DialogDescription><p className="text-xs leading-5 text-muted-foreground">{upgrade?.feature === "saved_scenarios" ? "Open your saved scenarios and remove one to free a slot." : upgrade?.plan !== "free" && upgrade?.code === "PLAN_LIMIT_REACHED" ? "Your allowance renews at the next daily or monthly reset. Your usage page shows the reset date." : "Keep using your current plan, or explore the plan that fits your next step."}</p><Button asChild className="mt-2 rounded-xl"><Link href="/pricing" onClick={() => setUpgrade(null)}>{upgrade?.required_plan === "institution" ? "View LumaPath Institution" : upgrade?.upgrade_required === false ? "View plan usage" : "View LumaPath Pro"}<ArrowRight size={16} /></Link></Button><Button variant="ghost" onClick={() => setUpgrade(null)}>Continue with my current plan</Button></DialogContent></Dialog></Context.Provider>;
}
