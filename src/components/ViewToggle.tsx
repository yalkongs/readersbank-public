"use client";

import { useSyncExternalStore } from "react";

// 글 목록 보기 방식. public/theme-init.js가 페이지를 그리기 전에 <html data-view>를 맞춰 둔다.
export const VIEW_KEY = "rb-view";
export type ListView = "list" | "grid";

function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-view"] });
  return () => mo.disconnect();
}
const current = (): ListView => (document.documentElement.dataset.view === "grid" ? "grid" : "list");

export function setListView(v: ListView) {
  if (v === "grid") document.documentElement.dataset.view = "grid";
  else delete document.documentElement.dataset.view;
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {}
}

const btn =
  "relative flex h-8 w-8 items-center justify-center rounded-full after:absolute after:-inset-1.5 after:content-[''] text-[var(--muted)] transition-colors hover:text-[var(--fg)] aria-pressed:bg-[var(--line)] aria-pressed:text-[var(--fg)]";

export function ViewToggle() {
  const view = useSyncExternalStore(subscribe, current, () => "list" as ListView);
  return (
    <div role="group" aria-label="목록 보기 방식" className="flex gap-0.5 rounded-full border border-[var(--line)] p-0.5">
      <button type="button" aria-label="목록 보기" title="목록 보기" aria-pressed={view === "list"} onClick={() => setListView("list")} className={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="4" width="7" height="6" rx="1" />
          <rect x="3" y="14" width="7" height="6" rx="1" />
          <path d="M14 6h7M14 9h5M14 16h7M14 19h5" />
        </svg>
      </button>
      <button type="button" aria-label="썸네일 보기" title="썸네일 보기" aria-pressed={view === "grid"} onClick={() => setListView("grid")} className={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
    </div>
  );
}
