// X(트위터) 게시물 추출. X 페이지는 JS로 그려져 HTML로 읽으면 줄바꿈과 첨부 사진이 사라지므로
// fxtwitter API로 원문을 받고, 실패하면 X 공식 임베드 데이터(짧은 글만 온전함)를 쓴다.
// 둘 다 실패하면 null을 돌려주고 호출자가 일반 HTML 추출로 넘어간다.
import { safeHref, type Block, type Inline } from "@/lib/blocks";
import { safeFetch, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { ExtractError, SHORT_MIN_CHARS, type ExtractResult } from "./types";
import { parseXArticle } from "./x-article";

type Fetcher = (url: string, opts: { maxBytes: number }) => Promise<SafeFetchResult>;

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const X_HOSTS = new Set(["x.com", "twitter.com", "mobile.x.com", "mobile.twitter.com", "www.x.com", "www.twitter.com"]);

export function parseXStatusUrl(url: string): { user: string; id: string } | null {
  try {
    const u = new URL(url);
    if (!X_HOSTS.has(u.hostname.toLowerCase())) return null;
    const m = /^\/(?:([A-Za-z0-9_]{1,15})|i(?:\/web)?)\/status(?:es)?\/(\d{1,25})(?:\/|$)/.exec(u.pathname);
    return m ? { user: m[1] ?? "i", id: m[2] } : null;
  } catch {
    return null;
  }
}

// x.com/i/article/<아티클 ID>: 아티클 ID로는 게시물을 찾을 수 없다(fxtwitter·X 모두 게시물 ID로만 조회된다).
export function isXArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return X_HOSTS.has(u.hostname.toLowerCase()) && /^\/i\/article\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

// 게시물에 X 아티클이 붙어 있으면 아티클 본문을 돌려준다(fxtwitter v2).
async function tryArticle(id: string, fetcher: Fetcher): Promise<ExtractResult | null> {
  try {
    const json = obj(await getJson(`https://api.fxtwitter.com/2/status/${id}`, fetcher));
    const status = obj(json.status);
    const parsed = parseXArticle(status.article);
    if (!parsed || parsed.blocks.length === 0) return null;
    const author = obj(status.author);
    const name = str(author.name) || str(author.screen_name);
    const firstFigure = parsed.blocks.find((b) => b.type === "figure");
    return {
      title: parsed.title || (name ? `${name}의 X 아티클` : "X 아티클"),
      blocks: parsed.blocks,
      coverImage: parsed.cover ?? (firstFigure?.type === "figure" ? firstFigure.src : null),
    };
  } catch {
    return null;
  }
}

type Photo = { url: string; width?: number; height?: number; alt?: string };
type Post = { author: string; handle: string; text: string; photos: Photo[]; videoThumb: string | null; quote: { author: string; text: string } | null };

const BULLET_RE = /^\s*[•·▪◦‣\-*]\s+/;

function inlines(text: string): Inline[] {
  const out: Inline[] = [];
  for (const part of text.split(/(https?:\/\/[^\s]+)/)) {
    if (!part) continue;
    const href = /^https?:\/\//.test(part) ? safeHref(part) : undefined;
    out.push(href ? { text: part, href } : { text: part });
  }
  return out;
}

// 빈 줄은 문단 경계, "•"/"-"로 시작하는 줄은 목록 항목. 이어지는 목록 문단은 하나의 목록으로 합친다.
export function postTextToBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    let para: string[] = [];
    let item: Inline[] | null = null; // 이 문단에서 마지막으로 연 목록 항목. 뒤따르는 줄은 그 항목에 이어 붙인다.
    const flush = () => {
      if (para.length) blocks.push({ type: "paragraph", text: inlines(para.join(" ")) });
      para = [];
    };
    for (const line of lines) {
      if (BULLET_RE.test(line)) {
        flush();
        item = inlines(line.replace(BULLET_RE, ""));
        const last = blocks[blocks.length - 1];
        if (last?.type === "list" && !last.ordered) last.items.push(item);
        else blocks.push({ type: "list", ordered: false, items: [item] });
      } else if (item) {
        item.push({ text: " " }, ...inlines(line));
      } else {
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}

function firstSentence(text: string, max = 80): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export function postToResult(p: Post): ExtractResult {
  const blocks = postTextToBlocks(p.text);
  if (p.quote?.text) {
    blocks.push({ type: "quote", text: [{ text: `${p.quote.author}: `, bold: true }, ...inlines(p.quote.text.replace(/\s*\n+\s*/g, " "))] });
  }
  const photos = p.photos.filter((ph) => safeHref(ph.url));
  for (const ph of photos) {
    blocks.push({
      type: "figure",
      src: ph.url,
      original_src: ph.url,
      ...(ph.alt ? { caption: ph.alt } : {}),
      ...(ph.width && ph.height ? { width: ph.width, height: ph.height } : {}),
    });
  }
  const head = firstSentence(p.text);
  return {
    title: head ? `${p.author}: ${head}` : `${p.author} (@${p.handle})`,
    blocks,
    coverImage: photos[0]?.url ?? safeHref(p.videoThumb) ?? null,
    minChars: SHORT_MIN_CHARS,
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | undefined => (typeof v === "number" && v > 0 ? v : undefined);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function parseFxTwitter(json: unknown): Post | null {
  const t = obj(obj(json).tweet);
  const text = str(t.text);
  if (!text) return null;
  const author = obj(t.author);
  const media = obj(t.media);
  const quote = obj(t.quote);
  return {
    author: str(author.name) || str(author.screen_name),
    handle: str(author.screen_name),
    text,
    photos: arr(media.photos).map((p) => ({ url: str(p.url), width: num(p.width), height: num(p.height), alt: str(p.altText) || undefined })),
    videoThumb: str(arr(media.videos)[0]?.thumbnail_url) || null,
    quote: str(quote.text) ? { author: str(obj(quote.author).name), text: str(quote.text) } : null,
  };
}

// 긴 글(note_tweet)은 임베드 데이터의 text가 잘려 있으므로 쓰지 않는다.
export function parseSyndication(json: unknown): Post | null {
  const t = obj(json);
  const text = str(t.text);
  if (!text || t.note_tweet) return null;
  const user = obj(t.user);
  let body = text;
  for (const m of arr(obj(t.entities).media)) body = body.replace(str(m.url), "");
  for (const u of arr(obj(t.entities).urls)) if (str(u.url) && str(u.expanded_url)) body = body.replace(str(u.url), str(u.expanded_url));
  return {
    author: str(user.name) || str(user.screen_name),
    handle: str(user.screen_name),
    text: body.trim(),
    photos: arr(t.mediaDetails)
      .filter((m) => m.type === "photo")
      .map((m) => {
        const info = obj(obj(m.original_info));
        return { url: str(m.media_url_https), width: num(info.width), height: num(info.height), alt: str(m.ext_alt_text) || undefined };
      }),
    videoThumb: str(arr(t.mediaDetails).find((m) => m.type === "video")?.media_url_https) || null,
    quote: null,
  };
}

function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

async function getJson(url: string, fetcher: Fetcher): Promise<unknown> {
  const res = await fetcher(url, { maxBytes: MAX_JSON_BYTES });
  return JSON.parse(res.body.toString("utf8"));
}

export async function extractFromX(url: string, fetcher: Fetcher = safeFetch): Promise<ExtractResult | null> {
  if (isXArticleUrl(url)) {
    throw new ExtractError("X 아티클 주소(x.com/i/article/…)로는 본문을 가져올 수 없어요. 아티클이 실린 게시물의 주소(x.com/아이디/status/…)로 등록해 주세요.");
  }
  const ref = parseXStatusUrl(url);
  if (!ref) return null;
  const article = await tryArticle(ref.id, fetcher);
  if (article) return article;
  const sources: [string, (j: unknown) => Post | null][] = [
    [`https://api.fxtwitter.com/${ref.user === "i" ? "i" : ref.user}/status/${ref.id}`, parseFxTwitter],
    [`https://cdn.syndication.twimg.com/tweet-result?id=${ref.id}&token=${syndicationToken(ref.id)}`, parseSyndication],
  ];
  for (const [api, parse] of sources) {
    try {
      const post = parse(await getJson(api, fetcher));
      if (post && post.text) return postToResult(post);
    } catch {
      // 다음 소스로
    }
  }
  return null;
}
