export type BillingCycle = "monthly" | "annual";
export const proPricing = {
  monthly: { amount: 4.99, label: "Monthly", interval: "month", months: 1 },
  annual: { amount: 47.90, label: "Annual", interval: "year", months: 12 },
} as const;

export const demoCardNumber = "4242424242424242";
export type CheckoutDetails = { name: string; email: string; country: string; postalCode: string; cardNumber: string; expiry: string; securityCode: string };
export type CheckoutErrors = Partial<Record<keyof CheckoutDetails, string>>;
export type DemoReceipt = { reference: string; email: string; name: string; country: string; postalCode: string; cycle: BillingCycle; createdAt: Date; renewalAt: Date };
export const formatCardNumber = (value: string) => value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
export const formatExpiry = (value: string) => value.replace(/\D/g, "").slice(0, 4).replace(/^(\d{2})(\d)/, "$1 / $2");
export const formatPrice = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export function validateCheckout(details: CheckoutDetails, now = new Date()): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (details.name.trim().length < 2) errors.name = "Enter the cardholder's full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) errors.email = "Enter a valid email address.";
  if (!details.country) errors.country = "Choose your billing country.";
  if (!details.postalCode.trim()) errors.postalCode = "Enter your postal code.";
  if (details.cardNumber.replace(/\D/g, "") !== demoCardNumber) errors.cardNumber = "Use the demo card: 4242 4242 4242 4242.";
  const expiry = details.expiry.replace(/\s/g, "").match(/^(\d{2})\/(\d{2})$/);
  const month = expiry ? Number(expiry[1]) : 0;
  const year = expiry ? 2000 + Number(expiry[2]) : 0;
  if (month < 1 || month > 12 || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) errors.expiry = "Enter a valid future expiry date.";
  if (!/^\d{3}$/.test(details.securityCode)) errors.securityCode = "Enter the 3-digit demo security code.";
  return errors;
}

export function renewalDate(cycle: BillingCycle, now = new Date()): Date {
  const result = new Date(now);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + proPricing[cycle].months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}
