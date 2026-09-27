import type { Metadata } from "next";
import { AccessPage } from "@/components/public/access-page";

export const metadata: Metadata = { title: "Welcome back", description: "Return to your LumaPath student journey." };

export default function LoginPage() {
  return <AccessPage mode="login" />;
}
