import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { Usage } from "@/lib/articles/repo";

export const MODELS = { main: "claude-sonnet-5-5", light: "claude-haiku-5-5", opus: "claude-opus-5-5" } as const;

export class LlmRefusalError extends Error {}
export class LlmTruncatedError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  return (client ??= new Anthropic());
}

export async function callJson<S extends z.ZodType>(opts: {
  model: keyof typeof MODELS;
  system: string;
  cachedContext?: string;
  user: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: Usage }> {
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [{ type: "text", text: opts.system }];
  if (opts.cachedContext) system.push({ type: "text", text: opts.cachedContext, cache_control: { type: "ephemeral" } });

  // Sonnet 호출은 안전 분류기 거절 시 서버 측 대체 모델로 재시도한다. Haiku는 fallback 미지원.
  const fallback =
    opts.model === "main" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};

  const res = await getClient().beta.messages.parse({
    model: MODELS[opts.model],
    max_tokens: opts.maxTokens ?? 16000,
    system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "medium" },
    ...fallback,
  });

  if (res.stop_reason === "refusal") throw new LlmRefusalError("모델이 이 문서의 처리를 거절했습니다");
  if (res.stop_reason === "max_tokens") throw new LlmTruncatedError("모델 응답이 길이 한도에서 잘렸습니다");
  if (res.parsed_output == null) throw new Error("모델 응답을 해석하지 못했습니다");

  return {
    data: res.parsed_output as z.infer<S>,
    usage: {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cacheRead: res.usage.cache_read_input_tokens ?? 0,
    },
  };
}

export function extractJsonText(content: Array<{ type: string; text?: string }>): string {
  return content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
}

// 긴 출력(PDF 등)은 비스트리밍 요청이 타임아웃되므로 스트리밍으로 호출한다.
export async function callJsonStreaming<S extends z.ZodType>(opts: {
  model: "main";
  system: string;
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: Usage }> {
  const stream = getClient().beta.messages.stream({
    model: MODELS[opts.model],
    max_tokens: opts.maxTokens ?? 64000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const res = await stream.finalMessage();

  if (res.stop_reason === "refusal") throw new LlmRefusalError("모델이 이 문서의 처리를 거절했습니다");
  if (res.stop_reason === "max_tokens") throw new LlmTruncatedError("모델 응답이 길이 한도에서 잘렸습니다");

  let data: z.infer<S>;
  try {
    data = opts.schema.parse(JSON.parse(extractJsonText(res.content)));
  } catch {
    throw new Error("모델 응답을 해석하지 못했습니다");
  }

  return {
    data,
    usage: {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cacheRead: res.usage.cache_read_input_tokens ?? 0,
    },
  };
}

// 웹 검색 도구로 답을 받는다. 검색 결과에 나온 주소 목록을 함께 돌려줘 호출자가 답의 주소를 검증할 수 있게 한다.
// 동적 필터링 버전(_20260209)은 검색 결과가 코드 실행 안에 숨어 주소를 검증할 수 없어 기본 버전을 쓴다.
export async function callWithWebSearch(opts: {
  system: string;
  user: string;
  maxUses?: number;
  maxTokens?: number;
}): Promise<{ text: string; searchedUrls: Set<string>; usage: Usage; searches: number }> {
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: opts.user }];
  const searchedUrls = new Set<string>();
  const usage: Usage = { input: 0, output: 0, cacheRead: 0 };
  let searches = 0;
  let text = "";
  // 서버 측 도구 반복이 한도에 닿으면 pause_turn으로 멈추므로 같은 대화를 다시 보내 이어 간다.
  for (let turn = 0; turn < 3; turn++) {
    const res = await getClient().beta.messages.create({
      model: MODELS.main,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: opts.maxUses ?? 4 }],
      output_config: { effort: "low" },
    });
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    searches += res.usage.server_tool_use?.web_search_requests ?? 0;
    for (const b of res.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") searchedUrls.add(r.url);
      }
    }
    text += extractJsonText(res.content);
    if (res.stop_reason === "refusal") throw new LlmRefusalError("모델이 이 문서의 처리를 거절했습니다");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return { text, searchedUrls, usage, searches };
}
