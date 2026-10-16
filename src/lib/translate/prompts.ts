import { z } from "zod";
import { BlockSchema, blockText, blocksToPlainText, type Block } from "@/lib/blocks";
import type { TranslatedItem } from "./merge";

export const BriefSchema = z.object({
  topic: z.string(),
  audience: z.string(),
  tone: z.string(),
  glossary: z.array(z.object({ source: z.string(), target: z.string() })),
});
export type Brief = z.infer<typeof BriefSchema>;

export const BRIEF_SYSTEM = `당신은 외국어(영어·일본어·중국어 등) 글을 한국어 웹진 기사로 옮기는 번역 편집자입니다. 번역을 시작하기 전에 글 전체를 읽고 번역 브리프를 작성합니다.
- topic: 글의 주제를 한 문장으로.
- audience: 원문이 겨냥한 독자와, 한국어판에서 상정할 독자.
- tone: 한국어 문체 지침. 예: "칼럼체 → 자연스러운 평서체 에세이, 문장은 짧게, 번역투 피하기".
- glossary: 글에 반복되는 고유명사·전문용어의 한국어 표기(최대 40개). 처음 등장할 때 원어 병기가 필요하면 target에 "정렬(alignment)"처럼 적습니다.`;

export function buildBriefUser(title: string, plain: string): string {
  return `제목: ${title}\n\n본문:\n${plain}`;
}

export const TranslationSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), block: BlockSchema })),
});

// 모든 글에 공통으로 적용하는 ReadersBank 문체 지침. 글마다 정하는 브리프(tone·glossary)가 이 지침보다 우선한다.
export const STYLE_GUIDE = `ReadersBank 문체 지침:
- 번역투를 피합니다: "~에 대한/~에 있어서/~를 통해" 남발, "~것이다"로 끝나는 문장 반복, 불필요한 피동("~되어지다", "~에 의해"), 무생물 주어("이 연구는 우리에게 ~을 보여 준다" → "이 연구를 보면 ~"), 기계적인 복수 "~들", "그녀/그들" 대명사 남발(이름이나 "그"로).
- 한 문장에 한 생각. 영어의 긴 관계절·삽입구는 문장을 나누어 풉니다. 주어와 서술어를 가깝게 둡니다.
- 문체는 평서체(~다)를 기본으로 하되, 원문이 대화체·구어체면 그 느낌을 살립니다. 한 글 안에서 문체를 섞지 않습니다.
- 외래어는 국립국어원 외래어 표기법을 따릅니다. 이미 굳은 표기(예: 컴퓨터, 데이터, 플랫폼)는 그대로 씁니다.
- 인명·기관명·작품명은 처음 나올 때 한 번만 원어를 괄호로 병기하고, 이후에는 한국어 표기만 씁니다. 널리 알려진 이름(구글, 애플 등)은 병기하지 않습니다.
- 숫자는 아라비아 숫자로 쓰고 큰 수는 만 단위로 읽기 쉽게 바꿉니다(1.2 billion → 12억). 통화는 원래 단위를 유지합니다(12억 달러). 단위는 한국에서 쓰는 형태로(마일은 원문 유지 후 필요하면 괄호로 km).
- 날짜는 "2024년 3월 5일", 연대는 "1990년대" 형식으로 씁니다.
- 인용문은 큰따옴표 “ ”, 작품명은 『 』(책)·「 」(글·논문)·< >(영화·노래)로 묶습니다. 원문의 이탤릭 강조는 굵게나 따옴표로 바꾸지 말고 문장으로 강조를 살립니다.
- 원문에 없는 설명·역주를 덧붙이지 않습니다. 꼭 필요하면 괄호 안에 짧게만.`;

export const TRANSLATE_SYSTEM = `당신은 외국어(영어·일본어·중국어 등) 글을 한국어 웹진 기사로 옮기는 번역가입니다.
원칙:
1. 직역하지 말고, 한국어 독자가 처음부터 한국어로 쓰인 글처럼 읽도록 의역합니다. 문장 구조는 과감히 바꿔도 되지만 의미·뉘앙스·사실관계는 바꾸지 않습니다.
2. 번역 브리프의 문체 지침과 용어집, 그리고 아래 ReadersBank 문체 지침을 따릅니다.
3. 입력의 각 블록을 같은 index, 같은 type으로 하나씩 번역해 items로 돌려줍니다. 블록을 합치거나 나누거나 빠뜨리지 않습니다.
4. figure 블록은 caption만 번역합니다. table은 셀 텍스트를 번역합니다. 링크(href)는 그대로 둡니다.
5. 원문 전체가 주어지면 앞뒤 맥락(뒤에서 설명되는 개념, 복선, 인물 관계, 반복되는 표현)을 파악해 번역에 반영하되, 요청받은 블록만 번역합니다.
6. 직전 부분의 번역이 주어지면 문맥과 용어를 이어받되, 그 부분을 다시 번역하지 않습니다.
7. LaTeX 수식($…$, $$…$$, \\(…\\), \\[…\\])은 구분 기호와 내용을 한 글자도 바꾸지 않고 그대로 둡니다.

${STYLE_GUIDE}`;

// 원문 전체를 블록 번호와 함께 준다. 모든 청크가 같은 내용이라 프롬프트 캐시로 재사용된다.
// 아주 긴 글은 캐시 쓰기 비용이 커지므로 생략하고 직전 번역만 문맥으로 쓴다.
export const MAX_SOURCE_CONTEXT = 300_000;

export function buildSourceContext(blocks: Block[]): string {
  const text = blocks
    .map((b, i) => [i, blockText(b)] as const)
    .filter(([, t]) => t.trim() !== "")
    .map(([i, t]) => `[${i}] ${t}`)
    .join("\n\n");
  return text.length > MAX_SOURCE_CONTEXT ? "" : text;
}

function sharedContext(brief: Brief, source: string): string {
  const full = source ? `원문 전체(블록 번호 [index] 포함, 맥락 참고용):\n${source}\n\n` : "";
  return `${full}번역 브리프:\n${JSON.stringify(brief, null, 2)}`;
}

export function buildChunkRequest(
  brief: Brief,
  items: TranslatedItem[],
  prevTail: string,
  source = "",
): { cachedContext: string; user: string } {
  const context = prevTail ? `직전 부분의 번역(문맥 참고용):\n${prevTail}\n\n` : "";
  return {
    cachedContext: sharedContext(brief, source),
    user: `${context}번역할 블록(JSON):\n${JSON.stringify(items)}`,
  };
}

export const ReviewSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), block: BlockSchema })),
});

export const REVIEW_SYSTEM = `당신은 한국어 웹진의 교정 편집자입니다. 외국어 원문과 그 한국어 번역을 블록 단위로 대조해 번역을 다듬습니다.
점검할 것:
1. 오역·누락: 원문의 의미, 사실관계(숫자·이름·날짜), 뉘앙스, 논리 관계(그러나/따라서 등)가 그대로 옮겨졌는지. 빠진 문장이나 덧붙은 내용이 없는지.
2. 번역투: 아래 ReadersBank 문체 지침에 어긋나는 어색한 표현을 자연스러운 한국어로.
3. 일관성: 번역 브리프의 용어집과 문체, 글 전체에서 같은 대상을 같은 말로 부르는지.
규칙:
- 고칠 필요가 있는 블록만 items로 돌려줍니다. 고칠 것이 없으면 items를 빈 배열로 둡니다. 취향 차이 수준의 수정은 하지 않습니다.
- 돌려주는 블록은 그 블록의 완성된 번역 전체입니다(고친 부분만이 아니라). index와 type은 입력과 같게, 링크(href)·굵게·기울임 구조와 LaTeX 수식은 그대로 둡니다.
- figure는 caption만, table은 셀 텍스트만 고칩니다.
- 블록을 합치거나 나누지 않습니다.

${STYLE_GUIDE}`;

export function buildReviewRequest(
  brief: Brief,
  pairs: { index: number; original: Block; translation: Block }[],
  source = "",
): { cachedContext: string; user: string } {
  return {
    cachedContext: sharedContext(brief, source),
    user: `대조할 블록(JSON, original은 원문, translation은 현재 번역):\n${JSON.stringify(pairs)}`,
  };
}

export function tailText(blocks: Block[], maxChars = 1500): string {
  return blocksToPlainText(blocks).slice(-maxChars);
}
