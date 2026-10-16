import { z } from "zod";
import { normalizeTags } from "@/lib/tags";

export const SummarySchema = z.object({
  title_ko: z.string(),
  lead_ko: z.string(),
  summary: z.array(z.string()),
  tags: z.array(z.string()),
});

export const SUMMARY_SYSTEM = `당신은 한국어 웹진 편집자입니다. 기사 본문을 읽고 다음을 작성합니다.
- title_ko: 원제목이 한국어가 아니면 의미를 살린 자연스러운 한국어 제목(직역투 피함). 원제목이 한국어면 그대로 둡니다.
- lead_ko: 기사의 핵심을 담은 한 문장(60자 내외).
- summary: 독자가 본문을 읽기 전에 알아야 할 핵심 요점 3~5개. 각 항목은 한 문장.
- tags: 주제 태그 2~4개. 기존 태그 목록에 의미가 맞는 것이 있으면 그 표기를 그대로 재사용합니다. 태그는 한국어(한글)로 쓰고 \"AI\" 같은 영어 고유명사·약어는 허용하며, 한자(漢字)나 일본어 가나는 절대 쓰지 않습니다.`;

export function buildSummaryUser(input: { titleOriginal: string; body: string; existingTags: string[] }): string {
  const tags = input.existingTags.length ? input.existingTags.join(", ") : "(없음)";
  return `기존 태그 목록: ${tags}\n\n원제목: ${input.titleOriginal}\n\n본문:\n${input.body}`;
}

export { hasCjkOrKana, normalizeTags } from "@/lib/tags";

export function normalizeSummary(raw: z.infer<typeof SummarySchema>) {
  const tags = normalizeTags(raw.tags, 4);
  return {
    titleKo: raw.title_ko.trim(),
    leadKo: raw.lead_ko.trim(),
    summary: raw.summary.map((s) => s.trim()).filter(Boolean).slice(0, 5),
    tags,
  };
}
