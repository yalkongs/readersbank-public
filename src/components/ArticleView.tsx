"use client";

import { useState } from "react";
import type { Block } from "@/lib/blocks";
import { tocEntries } from "@/lib/reading";
import { BlockList } from "./BlockRenderer";
import type { MathMap } from "@/lib/math";
import { Lightbox } from "./Lightbox";
import { ReadingProgress } from "./ReadingProgress";

type Mode = "ko" | "original";

export function ArticleView({
  ko,
  original,
  untranslated,
  originalLang = "en",
  math,
}: {
  ko: Block[];
  original: Block[] | null;
  untranslated: number[];
  originalLang?: string;
  math?: MathMap;
}) {
  const [mode, setMode] = useState<Mode>("ko");
  // 처음 그릴 때는 페이지 진입 효과와 겹치지 않게, 보기를 바꾼 뒤에만 교차 전환을 건다.
  const [switched, setSwitched] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; caption?: string } | null>(null);
  const hasOriginal = original != null;
  const onFigureClick = (src: string, caption?: string) => setZoom({ src, caption });
  const toc = mode === "original" && original ? tocEntries(original) : tocEntries(ko);

  const modes: [Mode, string][] = [["ko", "번역"], ["original", "원문"]];

  return (
    <>
      <ReadingProgress />
      {hasOriginal && (
        <div role="group" aria-label="본문 보기" className="view-toggle">
          {modes.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => {
              if (m !== mode) setSwitched(true);
              setMode(m);
            }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {toc.length > 0 && (
        <details open className="toc">
          <summary>목차</summary>
          <ul>
            {toc.map((t) => (
              <li key={t.id} data-level={t.level}>
                <a href={`#${t.id}`}>{t.text}</a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div key={mode} className={`prose-ko ${switched ? "t-swap-soft" : ""}`} lang={mode === "original" ? originalLang : "ko"}>
        {mode === "original" && original ? (
          <BlockList blocks={original} onFigureClick={onFigureClick} math={math} />
        ) : (
          <BlockList blocks={ko} untranslated={untranslated} onFigureClick={onFigureClick} math={math} />
        )}
      </div>
      {zoom && <Lightbox src={zoom.src} caption={zoom.caption} onClose={() => setZoom(null)} />}
    </>
  );
}
