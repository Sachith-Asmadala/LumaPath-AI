import type { Metadata } from "next";
import { AccessPage } from "@/components/public/access-page";

export const metadata: Metadata = { title: "Start your journey", description: "Find your starting point with LumaPath." };

export default function RegisterPage() {
  return <AccessPage mode="register" />;
}
