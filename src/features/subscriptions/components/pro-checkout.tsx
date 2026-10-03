"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, CreditCard, Download, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { BrandIcon } from "@/components/brand/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemo } from "@/state/demo-provider";
import { useSubscription } from "./subscription-provider";
import { demoCardNumber, formatCardNumber, formatExpiry, formatPrice, proPricing, renewalDate, validateCheckout, type BillingCycle, type CheckoutDetails, type CheckoutErrors, type DemoReceipt } from "../checkout";

import { ProActivationMoment } from "./pro-intelligence-home";

const benefits = ["Light, dark, and system appearance", "100 assistant requests every day", "Advanced adaptive planning", "30 career comparisons per month", "More CV and document analyses", "Regional insights & saved scenarios"];
const countries = ["Sri Lanka", "India", "Singapore", "United States", "United Kingdom", "Australia", "Canada", "Germany"];

export function ProCheckout() {
  return <CheckoutContent />;
}

function CheckoutContent() {
  const { state, onboardingReady, signedOut } = useDemo();
  const { subscription, loading, error: subscriptionError, refresh, switchDemoPlan } = useSubscription();
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [details, setDetails] = useState<CheckoutDetails>({ name: "", email: "", country: "Sri Lanka", postalCode: "", cardNumber: "", expiry: "", securityCode: "" });
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [phase, setPhase] = useState<"details" | "processing" | "activating">("details");
  const [submitError, setSubmitError] = useState("");
  const [receipt, setReceipt] = useState<DemoReceipt | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const submitting = useRef(false);
  const receiptDownloadInProgress = useRef(false);
  const firstError = useRef<HTMLFormElement>(null);
  const pricing = proPricing[cycle];
  const busy = phase !== "details";
  const enabled = subscription?.demo_switch_enabled === true && process.env.NODE_ENV !== "production";
  const hasPro = subscription?.plan === "pro" || subscription?.plan === "institution";

  useEffect(() => {
    if (!onboardingReady) return;
    if (signedOut) router.replace("/login");
    else if (!state.onboarding.completed) router.replace("/onboarding");
  }, [onboardingReady, signedOut, state.onboarding.completed, router]);
  useEffect(() => { setDetails((previous) => ({ ...previous, name: previous.name || state.student.name })); }, [state.student.name]);

  function update(field: keyof CheckoutDetails, value: string) {
    setDetails((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setSubmitError("");
  }

  function useDemoDetails() {
    const nextYear = String((new Date().getFullYear() + 2) % 100).padStart(2, "0");
    setDetails({ name: state.student.name || "Sachith Perera", email: "sachith@example.com", country: "Sri Lanka", postalCode: "10250", cardNumber: formatCardNumber(demoCardNumber), expiry: `12 / ${nextYear}`, securityCode: "123" });
    setErrors({}); setSubmitError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !enabled || hasPro) return;
    const validation = validateCheckout(details);
    setErrors(validation);
    if (Object.keys(validation).length) {
      firstError.current?.querySelector<HTMLInputElement>(`#checkout-${Object.keys(validation)[0]}`)?.focus();
      return;
    }
    submitting.current = true;
    setSubmitError(""); setPhase("processing");
    try {
      // Simulate the payment step locally. Card and billing fields never leave this component.
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setPhase("activating");
      await switchDemoPlan("pro");
      const createdAt = new Date();
      const completedReceipt: DemoReceipt = { reference: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, email: details.email.trim(), name: details.name.trim(), country: details.country, postalCode: details.postalCode.trim(), cycle, createdAt, renewalAt: renewalDate(cycle, createdAt) };
      setReceipt(completedReceipt);
      setDetails((previous) => ({ ...previous, cardNumber: "", expiry: "", securityCode: "" }));
      void downloadReceipt(completedReceipt);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "We couldn't activate Pro. Please try again; no payment was collected.");
    } finally { submitting.current = false; setPhase("details"); }
  }

  async function downloadReceipt(targetReceipt = receipt) {
    if (!targetReceipt || receiptDownloadInProgress.current) return;
    receiptDownloadInProgress.current = true;
    setDownloadingReceipt(true); setReceiptError("");
    try {
      const { downloadReceiptPdf } = await import("../receipt-pdf");
      await downloadReceiptPdf(targetReceipt);
    } catch {
      setReceiptError("The PDF receipt could not be downloaded. Please try again.");
    } finally { receiptDownloadInProgress.current = false; setDownloadingReceipt(false); }
  }

  function fieldError(field: keyof CheckoutDetails) {
    return errors[field] ? <p id={`checkout-${field}-error`} className="mt-1.5 text-xs text-destructive" role="alert">{errors[field]}</p> : null;
  }
  const accessibility = (field: keyof CheckoutDetails) => ({ id: `checkout-${field}`, "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `checkout-${field}-error` : undefined });

  if (!onboardingReady || signedOut || !state.onboarding.completed) return <main className="grid min-h-dvh place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading checkout" /></main>;

  return <main className="min-h-dvh bg-background text-foreground">
    <header className="border-b border-border/70"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/pricing" className={`inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground ${busy ? "pointer-events-none opacity-50" : ""}`} aria-disabled={busy}><ArrowLeft size={15} />Back to plans</Link>
      <Link href="/overview" className={`flex items-center gap-2.5 ${busy ? "pointer-events-none" : ""}`} aria-label="LumaPath home"><BrandIcon size={30} decorative /><span className="font-heading text-lg font-semibold tracking-tight">LumaPath<span className="ml-1 font-normal text-muted-foreground">AI</span></span></Link>
      <span className="rounded-full border border-warning/25 bg-warning/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-warning">Demo mode</span>
    </div></header>

    {receipt ? <div className="mx-auto max-w-xl px-5 py-12 sm:py-20"><div className="mb-7 flex justify-center"><div className="grid size-20 place-items-center rounded-full border border-success/25 bg-success/10 text-success"><CheckCheck size={34} strokeWidth={1.5} /></div></div>
      <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-primary">Your next chapter starts here</p>
      <h1 className="mt-3 text-center font-heading text-4xl font-semibold tracking-tight">You’re on Pro.</h1>
      <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">Your demo upgrade is complete. Explore your higher limits,<br className="hidden sm:block" /> deeper insights, and adaptive planning.</p>
      <ProActivationMoment /><section className="mt-8 rounded-2xl border border-border bg-surface-raised p-6" aria-label="Demo receipt"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-medium"><Sparkles size={17} className="text-primary" />LumaPath Pro</div><span className="rounded-full bg-success/10 px-2.5 py-1 text-xs text-success">Activated</span></div><dl className="mt-5 space-y-3 border-t border-border/70 pt-5 text-xs"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Billing cycle</dt><dd>{proPricing[receipt.cycle].label}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Demo total</dt><dd>{formatPrice(proPricing[receipt.cycle].amount)} USD</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Amount charged</dt><dd className="text-success">$0.00</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{receipt.reference}</dd></div></dl><p className="mt-5 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">Your PDF receipt downloads automatically after activation. You can save another copy below. No payment was collected and no email was sent.</p></section>
      <Button asChild className="mt-6 h-12 w-full rounded-xl"><Link href="/overview#plan-demo">Explore my Pro workspace<ArrowRight size={16} /></Link></Button><Button variant="ghost" className="mt-2 h-11 w-full text-xs" disabled={downloadingReceipt} onClick={() => void downloadReceipt()}>{downloadingReceipt ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}{downloadingReceipt ? "Preparing PDF…" : "Download PDF receipt"}</Button>{receiptError && <p role="alert" className="mt-2 text-center text-xs text-destructive">{receiptError}</p>}
    </div> : <div className="mx-auto grid max-w-6xl gap-10 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[0.9fr_1fr] lg:gap-20">
      <aside className="min-w-0"><div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"><span className="flex items-center gap-1.5 text-success"><Check size={12} />Choose plan</span><span className="h-px w-6 bg-border" /><span className="text-foreground">02 Checkout</span><span className="h-px w-6 bg-border" /><span>03 Ready</span></div>
        <h1 className="mt-8 font-heading text-4xl font-semibold leading-[1.15] tracking-tight sm:text-[2.75rem]">A little more room.<br /><span className="text-primary">A lot more possibility.</span></h1><p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">Invest in your next chapter. More support, smarter planning, and space to follow your ambition.</p>
        <section className="mt-8 overflow-hidden rounded-[24px] border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-7" aria-label="Order summary"><div className="flex items-start justify-between"><div><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">Your membership</p><h2 className="mt-2 font-heading text-2xl font-semibold">LumaPath Pro</h2></div><span className="grid size-11 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><Sparkles size={21} /></span></div>
          <fieldset disabled={busy || hasPro} className="mt-6 grid grid-cols-2 gap-2"><legend className="sr-only">Billing cycle</legend>{(["monthly", "annual"] as const).map((value) => <label key={value} className={`relative cursor-pointer rounded-xl border px-3 py-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${cycle === value ? "border-primary bg-primary/8 ring-1 ring-primary/20" : "border-border bg-background/40 hover:border-primary/40"}`}><input type="radio" name="billing-cycle" value={value} checked={cycle === value} onChange={() => setCycle(value)} className="absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default" /><span className="flex items-center justify-between gap-1 font-medium">{proPricing[value].label}<span className={`grid size-3.5 place-items-center rounded-full border ${cycle === value ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{cycle === value && <Check size={9} />}</span></span><span className="mt-1 block text-[11px] text-muted-foreground">{value === "monthly" ? "$4.99 / month" : "$47.90 / year"}</span>{value === "annual" && <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">SAVE 20%</span>}</label>)}</fieldset>
          <ul className="mt-6 space-y-3">{benefits.map((benefit) => <li key={benefit} className="flex gap-2.5 text-xs leading-5"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" />{benefit}</li>)}</ul><div className="mt-6 space-y-3 border-t border-border/80 pt-5 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Pro · billed {cycle === "monthly" ? "monthly" : "annually"}</span><span>{formatPrice(pricing.amount)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Additional demo fees</span><span>$0.00</span></div><div className="flex items-baseline justify-between border-t border-border/80 pt-4"><span className="text-sm font-medium">Total today</span><span className="font-heading text-2xl font-semibold">{formatPrice(pricing.amount)}<span className="ml-1.5 font-sans text-xs font-normal text-muted-foreground">USD</span></span></div></div>
        </section><div className="mt-5 flex items-center gap-2.5 px-1 text-xs text-muted-foreground"><ShieldCheck size={17} className="shrink-0 text-primary" /><span>One membership. Your learning, planning, and career tools together.</span></div>
      </aside>

      <section className="min-w-0 lg:pt-11" aria-label="Payment details">
        {hasPro ? <div className="rounded-2xl border border-success/20 bg-success/5 p-7"><CheckCheck className="size-8 text-success" /><h2 className="mt-5 font-heading text-2xl font-semibold">Pro is already part of your plan.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Your {subscription?.name} membership already includes these features. Your workspace is ready.</p><Button asChild className="mt-6 h-11 rounded-xl"><Link href="/overview">Open my workspace<ArrowRight size={15} /></Link></Button></div> : <>
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-heading text-2xl font-semibold tracking-tight">Complete your upgrade</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">A simple step toward everything Pro has to offer.</p></div><LockKeyhole className="mt-1 size-5 shrink-0 text-muted-foreground" /></div>
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"><p className="text-xs leading-5 text-muted-foreground">Try the checkout with sample details.<br /><span className="text-foreground">No payment will be collected.</span></p><Button type="button" variant="outline" size="sm" className="shrink-0 rounded-lg text-xs" disabled={busy} onClick={useDemoDetails}>Use demo card</Button></div>
        {subscriptionError && <div className="mt-4 rounded-xl border border-warning/25 p-4"><p role="alert" className="text-xs leading-5 text-muted-foreground">{subscriptionError}</p><Button variant="outline" size="sm" className="mt-2" disabled={loading} onClick={() => void refresh()}>Retry connection</Button></div>}
        {!loading && subscription && !enabled && <p className="mt-4 text-xs leading-5 text-muted-foreground">Checkout preview only. Pro activation is available in the development demo.</p>}
        <form noValidate autoComplete="off" onSubmit={(event) => void submit(event)} className="mt-6" ref={firstError}>
          <fieldset disabled={busy} className="space-y-4"><legend className="mb-4 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Billing details</legend>
            <div><label htmlFor="checkout-email" className="mb-2 block text-xs font-medium">Email address</label><Input {...accessibility("email")} value={details.email} onChange={(event) => update("email", event.target.value)} type="email" placeholder="you@example.com" maxLength={254} className="h-11 rounded-xl px-3.5" />{fieldError("email")}</div>
            <div><label htmlFor="checkout-name" className="mb-2 block text-xs font-medium">Cardholder name</label><Input {...accessibility("name")} value={details.name} onChange={(event) => update("name", event.target.value)} placeholder="Full name on card" maxLength={100} className="h-11 rounded-xl px-3.5" />{fieldError("name")}</div>
            <div className="grid grid-cols-[1.3fr_1fr] gap-3"><div><label htmlFor="checkout-country" className="mb-2 block text-xs font-medium">Country</label><div className="relative"><select {...accessibility("country")} value={details.country} onChange={(event) => update("country", event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-input bg-background pl-3.5 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{countries.map((country) => <option key={country}>{country}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 size-3.5 text-muted-foreground" /></div>{fieldError("country")}</div><div><label htmlFor="checkout-postalCode" className="mb-2 block text-xs font-medium">Postal code</label><Input {...accessibility("postalCode")} value={details.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="10250" maxLength={16} className="h-11 rounded-xl px-3.5" />{fieldError("postalCode")}</div></div>
          </fieldset>
          <fieldset disabled={busy} className="mt-6"><legend className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Payment method</legend>
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/35 bg-primary/5 px-4 py-3"><span className="flex items-center gap-2.5 text-xs font-medium"><CreditCard size={17} className="text-primary" />Credit or debit card</span><div className="flex gap-1.5" aria-label="Visa and Mastercard demo"><span className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-bold italic tracking-tight">VISA</span><span className="flex items-center rounded border border-border bg-background px-2 py-1"><span className="size-3 rounded-full bg-[#eb5757]" /><span className="-ml-1 size-3 rounded-full bg-[#f2b348]/90" /></span></div></div>
            <div><label htmlFor="checkout-cardNumber" className="mb-2 block text-xs font-medium">Card number</label><div className="relative"><Input {...accessibility("cardNumber")} value={details.cardNumber} onChange={(event) => update("cardNumber", formatCardNumber(event.target.value))} placeholder="4242 4242 4242 4242" inputMode="numeric" maxLength={19} className="h-11 rounded-xl pl-3.5 pr-11 font-mono text-xs" /><CreditCard className="pointer-events-none absolute right-3.5 top-3.5 size-4 text-muted-foreground" /></div>{fieldError("cardNumber")}</div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div><label htmlFor="checkout-expiry" className="mb-2 block text-xs font-medium">Expiry date</label><Input {...accessibility("expiry")} value={details.expiry} onChange={(event) => update("expiry", formatExpiry(event.target.value))} placeholder="MM / YY" inputMode="numeric" maxLength={7} className="h-11 rounded-xl px-3.5 font-mono text-xs" />{fieldError("expiry")}</div><div><label htmlFor="checkout-securityCode" className="mb-2 block text-xs font-medium">Security code</label><Input {...accessibility("securityCode")} value={details.securityCode} onChange={(event) => update("securityCode", event.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="CVC" inputMode="numeric" type="password" maxLength={3} className="h-11 rounded-xl px-3.5 font-mono text-xs" />{fieldError("securityCode")}</div></div>
          </fieldset>
          {submitError && <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-xs leading-5 text-destructive">{submitError}</p>}
          <Button type="submit" disabled={busy || loading || !enabled} className="mt-6 h-12 w-full rounded-xl text-sm shadow-sm">{busy ? <><LoaderCircle size={16} className="animate-spin" />{phase === "processing" ? "Processing demo payment…" : "Activating Pro…"}</> : <><LockKeyhole size={15} />Activate Pro · {formatPrice(pricing.amount)} / {pricing.interval}<ArrowRight size={15} className="ml-auto" /></>}</Button>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">Demo transaction · Only sample card details are accepted.<br />Card details stay in this page and are never sent or saved.</p>
          <div className="mt-6 border-t border-border/70 pt-4 text-center text-[11px] leading-5 text-muted-foreground">{cycle === "annual" ? "Annual preview: $47.90 billed once per year." : "Monthly preview: $4.99 billed once per month."} In a live checkout,<br className="hidden sm:block" /> your membership would renew until cancelled.</div>
        </form></>}
      </section>
    </div>}
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-5 text-[10px] text-muted-foreground sm:px-8"><span>© {new Date().getFullYear()} LumaPath AI</span><span className="flex items-center gap-1.5"><LockKeyhole size={11} />LumaPath checkout · Demo experience</span></footer>
  </main>;
}
