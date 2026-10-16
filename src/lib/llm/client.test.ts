import { describe, expect, it } from "vitest";
import { extractJsonText } from "@/lib/llm/client";

describe("extractJsonText", () => {
  it("joins only text blocks", () => {
    expect(extractJsonText([{ type: "thinking" }, { type: "text", text: '{"a":' }, { type: "text", text: "1}" }])).toBe('{"a":1}');
  });
});
