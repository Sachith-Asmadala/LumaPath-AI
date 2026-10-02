import { describe, expect, it } from "vitest";
import { emptyPortfolioFacts, isPortfolioProject } from "@/features/portfolio/domain/portfolio";

describe("portfolio frontend contract", () => {
  it("starts manual facts without claiming repository evidence", () => {
    expect(emptyPortfolioFacts()).toMatchObject({ has_readme: false, has_tests: false, languages: [], technologies: [] });
  });

  it("rejects incomplete API project shapes", () => {
    expect(isPortfolioProject({ id: "p1", title: "Project" })).toBe(false);
    expect(isPortfolioProject({ id: "p1", title: "Project", target_role: "DevOps Engineer", facts: emptyPortfolioFacts() })).toBe(true);
  });
});
