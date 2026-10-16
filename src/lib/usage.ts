// src/lib/usage.ts — LLM 사용량 비용 추정(추정치). 단가: USD per 1M tokens.
export type ModelKey = "sonnet" | "haiku" | "opus";
export type UsageRow = { step: string; input: number; output: number; cacheRead: number; calls: number };

export const MODEL_PRICES: Record<ModelKey, { input: number; output: number; cacheRead: number }> = {
  sonnet: { input: 2, output: 10, cacheRead: 0.2 },
  haiku: { input: 0.1, output: 0.5, cacheRead: 0.01 },
  opus: { input: 4, output: 20, cacheRead: 0.2 },
};

const STEP_MODEL: Record<string, ModelKey> = {
  translate: "sonnet",
  brief: "sonnet",
  summarize: "sonnet",
  extract_pdf: "sonnet",
  detect_lang: "haiku",
  related: "sonnet",
  cover_prompt: "opus",
};

export function modelForStep(step: string): ModelKey {
  return STEP_MODEL[step] ?? "sonnet";
}

export function estimateCostUsd(rows: UsageRow[], modelByStep: Record<string, ModelKey> = {}): number {
  let total = 0;
  for (const r of rows) {
    const p = MODEL_PRICES[modelByStep[r.step] ?? modelForStep(r.step)];
    total += (r.input * p.input + r.output * p.output + r.cacheRead * p.cacheRead) / 1_000_000;
  }
  return total;
}
