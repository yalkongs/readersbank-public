import { describe, expect, it } from "vitest";
import { MODEL_PRICES, estimateCostUsd, modelForStep } from "@/lib/usage";

describe("modelForStep", () => {
  it("maps detect_lang to haiku and other steps to sonnet", () => {
    expect(modelForStep("detect_lang")).toBe("haiku");
    for (const s of ["translate", "brief", "summarize", "extract_pdf", "unknown"]) expect(modelForStep(s)).toBe("sonnet");
  });
});

describe("estimateCostUsd", () => {
  it("uses fixed prices", () => {
    expect(MODEL_PRICES.sonnet).toEqual({ input: 2, output: 10, cacheRead: 0.2 });
    expect(MODEL_PRICES.haiku).toEqual({ input: 0.1, output: 0.5, cacheRead: 0.01 });
  });
  it("computes sonnet cost per 1M tokens", () => {
    const cost = estimateCostUsd([{ step: "translate", input: 1_000_000, output: 100_000, cacheRead: 500_000, calls: 3 }]);
    expect(cost).toBeCloseTo(2 + 1 + 0.1, 10);
  });
  it("prices detect_lang at haiku rates and sums rows", () => {
    const cost = estimateCostUsd([
      { step: "detect_lang", input: 1_000_000, output: 1_000_000, cacheRead: 0, calls: 1 },
      { step: "summarize", input: 500_000, output: 0, cacheRead: 0, calls: 1 },
    ]);
    expect(cost).toBeCloseTo(0.1 + 0.5 + 1, 10);
  });
  it("honors modelByStep override and returns 0 for no rows", () => {
    const rows = [{ step: "translate", input: 1_000_000, output: 0, cacheRead: 0, calls: 1 }];
    expect(estimateCostUsd(rows, { translate: "haiku" })).toBeCloseTo(0.1, 10);
    expect(estimateCostUsd([])).toBe(0);
  });
});
