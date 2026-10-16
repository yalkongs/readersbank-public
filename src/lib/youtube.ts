// 유튜브 주소 해석. 본문 편집(주소 한 줄 → 영상 블록)과 웹 글 추출(iframe)이 같은 규칙을 쓴다.

const ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeId(id: string): boolean {
  return ID.test(id);
}

// "1h2m3s", "90s", "90" 같은 시작 시각을 초로 바꾼다.
function parseStart(raw: string | null): number | undefined {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw) || undefined;
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return undefined;
  const s = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return s || undefined;
}

export function parseYouTubeUrl(raw: string): { id: string; start?: number } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | undefined;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v") ?? undefined;
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m?.[1];
    }
  }
  if (!id || !isYouTubeId(id)) return null;
  const start = parseStart(u.searchParams.get("t") ?? u.searchParams.get("start"));
  return start ? { id, start } : { id };
}

export function youTubeWatchUrl(id: string, start?: number): string {
  return `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;
}
