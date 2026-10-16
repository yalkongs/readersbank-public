"use client";

import { useEffect, useRef, useState } from "react";
import { readProgress, resumeBlock, updateProgress, writeProgress } from "@/lib/reading-progress";
import { usePresence } from "@/lib/use-presence";
import { scrollBehavior } from "@/lib/motion";

const HEADER_OFFSET = 80;
const SAVE_MS = 800;
const HINT_MS = 9000;

// 화면 위쪽에 걸친 첫 문단을 "지금 읽는 곳"으로 본다.
function currentBlock(): number {
  const nodes = document.querySelectorAll<HTMLElement>("main [data-block-index]");
  let found = 0;
  for (const n of Array.from(nodes)) {
    if (n.getBoundingClientRect().bottom > HEADER_OFFSET) {
      found = Number(n.dataset.blockIndex) || 0;
      break;
    }
  }
  return found;
}

function scrollRatio(): number {
  const el = document.documentElement;
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 1;
}

export function ReadingTracker({ slug, title, blocks }: { slug: string; title: string; blocks: number }) {
  // target은 안내가 닫히는 동안에도 남겨 두고, open만 내려 닫힘 전환을 보여 준다.
  const [target, setTarget] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const hint = usePresence(open, 150);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 이어 읽기 안내가 떠 있는 동안에는 저장하지 않는다(맨 위에서 조금 스크롤하자마자 예전 위치를 덮어쓰지 않게).
  const hold = useRef(false);

  useEffect(() => {
    const saved = readProgress(localStorage)[slug];
    const at = resumeBlock(saved, blocks);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setTarget(at);
    setOpen(at !== null);
    hold.current = at !== null;
    const hide =
      at !== null
        ? setTimeout(() => {
            hold.current = false;
            setOpen(false);
          }, HINT_MS)
        : null;

    const save = () => {
      timer.current = null;
      if (hold.current) return;
      const map = readProgress(localStorage);
      writeProgress(localStorage, updateProgress(map, slug, { title, block: currentBlock(), pct: scrollRatio(), blocks, at: Date.now() }));
    };
    const onScroll = () => {
      if (!timer.current) timer.current = setTimeout(save, SAVE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      if (hide) clearTimeout(hide);
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
    };
  }, [slug, title, blocks]);

  if (!hint.mounted || target === null) return null;
  const close = () => {
    hold.current = false;
    setOpen(false);
  };
  const go = () => {
    document.querySelector(`main [data-block-index="${target}"]`)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    close();
  };
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
      <div
        data-origin="bottom-center"
        className={`t-dropdown ${hint.stateClass} flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--bg)] p-1 text-sm shadow-lg`}
      >
        <button type="button" onClick={go} className="h-10 rounded-full bg-[var(--accent)] px-4 font-semibold text-[var(--bg)]">
          이어 읽기
        </button>
        <button type="button" onClick={close} aria-label="닫기" className="h-10 w-10 rounded-full text-[var(--muted)]">
          ✕
        </button>
      </div>
    </div>
  );
}
