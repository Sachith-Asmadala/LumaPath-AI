import { describe, expect, it } from "vitest";
import { demoCardNumber, formatCardNumber, formatExpiry, renewalDate, validateCheckout, type CheckoutDetails } from "./checkout";

const details: CheckoutDetails = { name: "Sachith Perera", email: "sachith@example.com", country: "Sri Lanka", postalCode: "10250", cardNumber: demoCardNumber, expiry: "12 / 28", securityCode: "123" };
const now = new Date(2026, 9, 3);

describe("demo checkout", () => {
  it("accepts the sample card and rejects other card numbers", () => {
    expect(validateCheckout(details, now)).toEqual({});
    expect(validateCheckout({ ...details, cardNumber: "5555555555554444" }, now).cardNumber).toContain("demo card");
    expect(validateCheckout({ ...details, cardNumber: formatCardNumber(demoCardNumber) }, now)).toEqual({});
  });

  it("validates billing details, expiration, and security code", () => {
    expect(validateCheckout({ ...details, name: "", email: "invalid", postalCode: "", expiry: "09 / 26", securityCode: "1" }, now)).toMatchObject({ name: expect.any(String), email: expect.any(String), postalCode: expect.any(String), expiry: expect.any(String), securityCode: expect.any(String) });
    expect(validateCheckout({ ...details, expiry: "13 / 28" }, now).expiry).toBeDefined();
    expect(validateCheckout({ ...details, expiry: "10 / 26" }, now).expiry).toBeUndefined();
    expect(formatExpiry("1228")).toBe("12 / 28");
  });

  it("clamps month-end renewals and leap-year annual renewals", () => {
    const monthly = renewalDate("monthly", new Date(2027, 0, 31));
    expect([monthly.getFullYear(), monthly.getMonth(), monthly.getDate()]).toEqual([2027, 1, 28]);
    const annual = renewalDate("annual", new Date(2028, 1, 29));
    expect([annual.getFullYear(), annual.getMonth(), annual.getDate()]).toEqual([2029, 1, 28]);
  });
});
