// 읽던 위치 기억(기기별, localStorage). 글마다 마지막으로 보던 문단과 진행률을 남긴다.
// 글이 다시 처리돼 문단 수가 바뀌면(blocks) 저장 위치를 버린다.
export const PROGRESS_KEY = "rb-progress";
const MAX_ENTRIES = 100;
const DONE_AT = 0.95;
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export type ProgressEntry = { title: string; block: number; pct: number; blocks: number; at: number; done: boolean };
export type ProgressMap = Record<string, ProgressEntry>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function parseProgress(raw: string | null): ProgressMap {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: ProgressMap = {};
    for (const [slug, e] of Object.entries(v as Record<string, Partial<ProgressEntry>>)) {
      if (!e || typeof e.block !== "number" || typeof e.pct !== "number" || typeof e.at !== "number") continue;
      out[slug] = {
        title: typeof e.title === "string" ? e.title.slice(0, 200) : "",
        block: Math.max(0, Math.floor(e.block)),
        pct: Math.min(1, Math.max(0, e.pct)),
        blocks: typeof e.blocks === "number" ? e.blocks : 0,
        at: e.at,
        done: Boolean(e.done),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function readProgress(storage: StorageLike): ProgressMap {
  try {
    return parseProgress(storage.getItem(PROGRESS_KEY));
  } catch {
    return {};
  }
}

// 한 번 끝까지 읽은 글은 다시 위로 올라가도 "읽음"으로 남긴다.
export function updateProgress(map: ProgressMap, slug: string, next: Omit<ProgressEntry, "done">): ProgressMap {
  const prev = map[slug];
  const done = (prev?.done && prev.blocks === next.blocks) || next.pct >= DONE_AT;
  const out: ProgressMap = { ...map, [slug]: { ...next, done } };
  const slugs = Object.keys(out).sort((a, b) => out[b].at - out[a].at);
  for (const s of slugs.slice(MAX_ENTRIES)) delete out[s];
  return out;
}

export function writeProgress(storage: StorageLike, map: ProgressMap): void {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // 저장 공간이 없거나 비공개 모드면 조용히 넘어간다.
  }
}

// 다시 열었을 때 "이어 읽기"를 권할 위치. 문단 수가 바뀌었거나, 거의 처음이거나, 다 읽었으면 없다.
export function resumeBlock(entry: ProgressEntry | undefined, blocks: number): number | null {
  if (!entry || entry.blocks !== blocks || entry.done) return null;
  if (entry.block < 2 || entry.pct < 0.05) return null;
  return entry.block;
}

export function inProgress(map: ProgressMap, now = Date.now(), limit = 3): { slug: string; entry: ProgressEntry }[] {
  return Object.entries(map)
    .filter(([, e]) => !e.done && e.pct >= 0.05 && now - e.at < STALE_MS && e.title)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .map(([slug, entry]) => ({ slug, entry }));
}

export function removeEntries(map: ProgressMap, slugs: string[]): ProgressMap {
  const out = { ...map };
  for (const s of slugs) delete out[s];
  return out;
}
