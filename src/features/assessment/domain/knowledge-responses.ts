/** Honest uncertainty counts as a response, but never as a correct answer. */
export const knowledgeResponses = [
  "I don’t know yet",
  "This is familiar, but I can’t recall the answer",
] as const;

export function isKnowledgeResponse(value: string) {
  return knowledgeResponses.some(option => option === value);
}

export function withKnowledgeResponses(options: readonly string[]): string[] {
  return [...options.filter(option => !isKnowledgeResponse(option)), ...knowledgeResponses];
}
