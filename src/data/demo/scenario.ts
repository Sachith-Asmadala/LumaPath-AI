/** One clock for the deterministic student scenario. Dates are local calendar dates. */
export const demoScenario = { date: "2026-09-28", label: "Student scenario" } as const;

export function scenarioDate(offset = 0): string {
  const date = new Date(`${demoScenario.date}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function scenarioAt(offset: number, time: string): string {
  return `${scenarioDate(offset)}T${time.length === 5 ? `${time}:00` : time}`;
}
export function scenarioWeekLabel(): string {
  const format = (offset: number) => new Date(`${scenarioDate(offset)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${format(0)} – ${format(6)}`;
}

/** Competition dates are scoped to its synthetic student; ordinary scenarios stay unchanged. */
export function stateScenarioDate(state: { competition?: { date: string } }, offset = 0): string {
  if (!state.competition) return scenarioDate(offset);
  const date = new Date(`${state.competition.date}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
