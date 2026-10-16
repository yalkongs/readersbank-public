// public/theme-init.js 가 이 매핑을 그대로 복제한다. 바꿀 때는 두 파일을 함께 고친다.
export const STORAGE_KEY = "rb-reader";

export type ReaderBg = "auto" | "white" | "sepia" | "gray" | "black";
export type ReaderFont = "sans" | "serif";
export type ReaderLeading = "tight" | "normal" | "loose";
export type ReaderSettings = { size: 1 | 2 | 3 | 4 | 5; bg: ReaderBg; font: ReaderFont; leading: ReaderLeading };

// 처음 오는 사람의 기본값: 회색 배경 · 명조 · 3단계 글자 · 보통 줄간격. "자동"(기기 밝기 따르기)은 직접 고를 수 있다.
export const DEFAULT_SETTINGS: ReaderSettings = { size: 3, bg: "gray", font: "serif", leading: "normal" };

const SIZES = [1, 2, 3, 4, 5] as const;
const BGS: readonly ReaderBg[] = ["auto", "white", "sepia", "gray", "black"];
const FONTS: readonly ReaderFont[] = ["sans", "serif"];
const LEADINGS: readonly ReaderLeading[] = ["tight", "normal", "loose"];

function pick<T>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function parseSettings(raw: string | null): ReaderSettings {
  let v: unknown;
  try {
    v = raw === null ? null : JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof v !== "object" || v === null) return { ...DEFAULT_SETTINGS };
  const o = v as Record<string, unknown>;
  return {
    size: pick(SIZES, o.size, DEFAULT_SETTINGS.size),
    bg: pick(BGS, o.bg, DEFAULT_SETTINGS.bg),
    font: pick(FONTS, o.font, DEFAULT_SETTINGS.font),
    leading: pick(LEADINGS, o.leading, DEFAULT_SETTINGS.leading),
  };
}

/** <html>에 붙일 data 속성. 목록에 없는 속성은 제거해야 한다. */
export function settingsToAttrs(s: ReaderSettings): Record<string, string> {
  const attrs: Record<string, string> = { "data-size": String(s.size), "data-font": s.font, "data-leading": s.leading };
  if (s.bg !== "auto") {
    attrs["data-bg"] = s.bg;
    attrs["data-theme"] = s.bg === "black" ? "dark" : "light";
  }
  return attrs;
}

export const ATTR_NAMES = ["data-size", "data-bg", "data-theme", "data-font", "data-leading"] as const;

/** 예전 rb-theme 값을 새 설정으로 옮긴다. */
export function migrateLegacyTheme(theme: string | null): Partial<ReaderSettings> {
  if (theme === "dark") return { bg: "black" };
  if (theme === "light") return { bg: "white" };
  return {};
}

export const BG_COLORS: Record<Exclude<ReaderBg, "auto">, string> = {
  white: "#ffffff",
  sepia: "#f6efe1",
  gray: "#e9e9e7",
  black: "#111111",
};

export const LEGACY_KEY = "rb-theme";

export function clearStoredSettings(storage: { removeItem(key: string): void }): void {
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(LEGACY_KEY);
}

export type MetaLike = { content: string; getAttribute(name: string): string | null; setAttribute(name: string, value: string): void };

/** 비자동 배경이면 모든 theme-color 메타를 배경색으로 덮고, 자동이면 처음 값으로 되돌린다. */
export function applyThemeColor(metas: MetaLike[], bg: ReaderBg): void {
  for (const m of metas) {
    if (m.getAttribute("data-rb-original") === null) {
      if (bg === "auto") continue;
      m.setAttribute("data-rb-original", m.content);
    }
    m.content = bg === "auto" ? (m.getAttribute("data-rb-original") as string) : BG_COLORS[bg];
  }
}
