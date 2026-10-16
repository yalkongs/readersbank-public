"use client";

import { useEffect, useState } from "react";
import {
  ATTR_NAMES,
  BG_COLORS,
  applyThemeColor,
  clearStoredSettings,
  LEGACY_KEY,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  migrateLegacyTheme,
  parseSettings,
  settingsToAttrs,
  type ReaderBg,
  type ReaderFont,
  type ReaderLeading,
  type ReaderSettings as Settings,
} from "@/lib/reader-settings";

const BG_OPTIONS: { value: ReaderBg; label: string; swatch: string }[] = [
  { value: "auto", label: "자동", swatch: "linear-gradient(90deg, #ffffff 50%, #111111 50%)" },
  { value: "white", label: "흰색", swatch: BG_COLORS.white },
  { value: "sepia", label: "세피아", swatch: BG_COLORS.sepia },
  { value: "gray", label: "회색", swatch: BG_COLORS.gray },
  { value: "black", label: "검정", swatch: BG_COLORS.black },
];
const FONT_OPTIONS: { value: ReaderFont; label: string }[] = [
  { value: "sans", label: "고딕" },
  { value: "serif", label: "명조" },
];
const LEADING_OPTIONS: { value: ReaderLeading; label: string }[] = [
  { value: "tight", label: "좁게" },
  { value: "normal", label: "보통" },
  { value: "loose", label: "넓게" },
];

function applyToDocument(s: Settings) {
  const el = document.documentElement;
  const attrs = settingsToAttrs(s);
  for (const name of ATTR_NAMES) {
    if (name in attrs) el.setAttribute(name, attrs[name]);
    else el.removeAttribute(name);
  }
  applyThemeColor(Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')), s.bg);
}

function readStored(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return parseSettings(raw);
    return { ...DEFAULT_SETTINGS, ...migrateLegacyTheme(localStorage.getItem(LEGACY_KEY)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const seg = "rounded-full px-4 h-11 text-sm border border-[var(--line)] aria-pressed:bg-[var(--fg)] aria-pressed:text-[var(--bg)]";
const stepBtn = "h-11 w-14 rounded-full border border-[var(--line)] text-sm font-semibold disabled:opacity-40";

/** 저장된 읽기 설정을 불러와 문서에 적용하고, 바꾸는 함수를 돌려준다. */
export function useReaderSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setSettings(stored);
    applyToDocument(stored);
  }, []);

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    applyToDocument(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function reset() {
    setSettings({ ...DEFAULT_SETTINGS });
    applyToDocument(DEFAULT_SETTINGS);
    try {
      clearStoredSettings(localStorage);
    } catch {}
  }

  return { settings, update, reset };
}

/** 글자 크기·배경·글꼴·줄간격 조절. 헤더 메뉴 안에 들어간다. */
export function ReaderSettingsControls({ settings, update, reset }: ReturnType<typeof useReaderSettings>) {
  return (
    <>
      <div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={stepBtn}
            aria-label="글자 작게"
            disabled={settings.size <= 1}
            onClick={() => update({ size: (settings.size - 1) as Settings["size"] })}
          >
            가−
          </button>
          <div className="flex gap-1.5" role="img" aria-label={`글자 크기 ${settings.size}단계 (5단계 중)`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className="h-2 w-2 rounded-full"
                style={{ background: n <= settings.size ? "var(--fg)" : "var(--line)" }}
              />
            ))}
          </div>
          <button
            type="button"
            className={stepBtn}
            aria-label="글자 크게"
            disabled={settings.size >= 5}
            onClick={() => update({ size: (settings.size + 1) as Settings["size"] })}
          >
            가+
          </button>
        </div>
      </div>
      <div>
        <div className="flex gap-1.5" role="group" aria-label="배경">
          {BG_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-label={o.label}
              title={o.label}
              aria-pressed={settings.bg === o.value}
              onClick={() => update({ bg: o.value })}
              className="h-10 w-10 rounded-full border border-[var(--muted)] aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-[var(--accent)]"
              style={{ background: o.swatch }}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="flex gap-2" role="group" aria-label="글꼴">
          {FONT_OPTIONS.map((o) => (
            <button key={o.value} type="button" className={seg} aria-pressed={settings.font === o.value} onClick={() => update({ font: o.value })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">줄간격</p>
        <div className="flex gap-2">
          {LEADING_OPTIONS.map((o) => (
            <button key={o.value} type="button" className={seg} aria-pressed={settings.leading === o.value} onClick={() => update({ leading: o.value })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={reset} className="text-sm text-[var(--muted)] underline underline-offset-2">
        기본값으로
      </button>
    </>
  );
}
