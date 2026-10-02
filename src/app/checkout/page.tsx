import type { Metadata } from "next";
import { ProCheckout } from "@/features/subscriptions/components/pro-checkout";

export const metadata: Metadata = { title: "Checkout · LumaPath Pro" };
export default function CheckoutPage() { return <ProCheckout />; }
