import { z } from "zod";
import { callJson } from "@/lib/llm/client";
import type { Block } from "@/lib/blocks";
import { BRIEF_SYSTEM, BriefSchema, buildBriefUser, buildChunkRequest, TRANSLATE_SYSTEM, TranslationSchema } from "@/lib/translate/prompts";
import { validateTranslation } from "@/lib/translate/merge";
import { SUMMARY_SYSTEM, SummarySchema, buildSummaryUser, normalizeSummary } from "@/lib/summarize";

const LangSchema = z.object({ lang: z.string() });

async function main() {
  const r = await callJson({
    model: "light",
    system: "Identify the language of the text. Answer with an ISO 639-1 code in `lang`.",
    user: "The quick brown fox jumps over the lazy dog.",
    schema: LangSchema,
    effort: "low",
    maxTokens: 1000,
  });
  console.log("lang:", r.data, "usage:", r.usage);

  const blocks: Block[] = [
    { type: "heading", level: 2, text: "Why alignment matters" },
    { type: "paragraph", text: [{ text: "Alignment research tries to make sure AI systems do what we " }, { text: "actually", italic: true }, { text: " want." }] },
    { type: "figure", src: "https://example.com/a.png", caption: "Figure 1: Research spending over time" },
  ];
  const brief = await callJson({ model: "main", system: BRIEF_SYSTEM, user: buildBriefUser("Alignment", "Alignment research tries to make sure AI systems do what we actually want."), schema: BriefSchema });
  console.log("brief:", brief.data);
  const req = buildChunkRequest(brief.data, blocks.map((block, index) => ({ index, block })), "");
  const tr = await callJson({ model: "main", system: TRANSLATE_SYSTEM, cachedContext: req.cachedContext, user: req.user, schema: TranslationSchema, effort: "high" });
  console.log("translation:", JSON.stringify(tr.data, null, 2));
  console.log("valid:", validateTranslation(blocks, [0, 1, 2], tr.data.items) !== null);

  const sum = await callJson({
    model: "main",
    system: SUMMARY_SYSTEM,
    user: buildSummaryUser({ titleOriginal: "Why alignment matters", body: "정렬 연구는 AI 시스템이 우리가 실제로 원하는 일을 하도록 만드는 연구입니다. 연구 투자는 해마다 늘고 있습니다.", existingTags: ["AI"] }),
    schema: SummarySchema,
  });
  console.log("summary:", normalizeSummary(sum.data));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
